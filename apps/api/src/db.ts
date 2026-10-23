import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema.js';
export function openDatabase(path = process.env.DATABASE_PATH || resolve(import.meta.dirname, '../../../data/nyambung.sqlite')) {
  const location = path === ':memory:' ? path : resolve(import.meta.dirname, '../../..', path);
  if (location !== ':memory:') mkdirSync(dirname(location), { recursive: true });
  const sqlite = new Database(location);
  sqlite.pragma('foreign_keys = ON'); sqlite.pragma('journal_mode = WAL'); sqlite.pragma('busy_timeout = 5000');
  // Versioned, additive bootstrap migration. Existing published snapshots are never rewritten.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS embeddings (word TEXT NOT NULL, model TEXT NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(word,model));
    CREATE TABLE IF NOT EXISTS daily (date TEXT PRIMARY KEY, number INTEGER NOT NULL, demo INTEGER NOT NULL, snapshot TEXT NOT NULL, published_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), date TEXT NOT NULL REFERENCES daily(date), completed_at TEXT);
    CREATE TABLE IF NOT EXISTS answers (run_id TEXT NOT NULL REFERENCES runs(id), stage INTEGER NOT NULL, result TEXT NOT NULL, PRIMARY KEY(run_id,stage));
    INSERT OR IGNORE INTO migrations(version) VALUES (1);`);
  sqlite.transaction(() => {
    if (!sqlite.prepare('SELECT 1 FROM migrations WHERE version = 2').get()) {
      sqlite.exec(`CREATE TABLE puzzle_versions (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, demo INTEGER NOT NULL);
        ALTER TABLE runs ADD COLUMN version_id TEXT REFERENCES puzzle_versions(id);
        ALTER TABLE runs ADD COLUMN superseded_at TEXT;
        DROP INDEX IF EXISTS one_daily_run;
        CREATE UNIQUE INDEX one_active_daily_run ON runs(player_id,date) WHERE superseded_at IS NULL;`);
      const insert = sqlite.prepare('INSERT OR IGNORE INTO puzzle_versions(id,snapshot,demo) VALUES (?,?,?)');
      const attach = sqlite.prepare('UPDATE runs SET version_id = ? WHERE date = ? AND version_id IS NULL');
      for (const row of sqlite.prepare('SELECT date,snapshot,demo FROM daily').all() as {date:string;snapshot:string;demo:number}[]) {
        const id = createHash('sha256').update(row.snapshot).digest('hex');
        insert.run(id, row.snapshot, row.demo); attach.run(id, row.date);
      }
      sqlite.exec('INSERT INTO migrations(version) VALUES (2)');
    }
  })();
  if (!sqlite.prepare('SELECT 1 FROM migrations WHERE version = 3').get()) {
    // Rebuild only the run table to allow random runs without a daily date FK.
    // Answers retain their IDs/FK; all data moves in one transaction.
    sqlite.pragma('foreign_keys = OFF');
    try {
      sqlite.transaction(() => {
        sqlite.exec(`CREATE TABLE runs_new (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), date TEXT NOT NULL,
          completed_at TEXT, version_id TEXT REFERENCES puzzle_versions(id), superseded_at TEXT,
          mode TEXT NOT NULL DEFAULT 'daily' CHECK(mode IN ('daily','random')), stage_order TEXT);
          INSERT INTO runs_new(id,player_id,date,completed_at,version_id,superseded_at) SELECT id,player_id,date,completed_at,version_id,superseded_at FROM runs;
          DROP TABLE runs; ALTER TABLE runs_new RENAME TO runs;
          CREATE UNIQUE INDEX one_active_daily_run ON runs(player_id,date) WHERE superseded_at IS NULL AND mode = 'daily';
          CREATE UNIQUE INDEX one_active_random_run ON runs(player_id) WHERE superseded_at IS NULL AND mode = 'random' AND completed_at IS NULL;
          CREATE INDEX comparison_cohort ON runs(date,version_id,mode,completed_at);
          CREATE TABLE random_pool (id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES puzzle_versions(id));`);
        if ((sqlite.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migrasi sesi gagal: referensi tidak valid.');
        sqlite.exec('INSERT INTO migrations(version) VALUES (3)');
      })();
    } catch (error) { sqlite.close(); throw error; }
    finally { if (sqlite.open) sqlite.pragma('foreign_keys = ON'); }
  }
  sqlite.transaction(() => {
    if (sqlite.prepare('SELECT 1 FROM migrations WHERE version = 4').get()) return;
    // Early v3 installations can predate stage_order. Repair them forward;
    // replaying the table rebuild would discard mode/selection information.
    const columns = sqlite.pragma('table_info(runs)') as { name:string }[];
    if (!columns.some(column => column.name === 'stage_order')) sqlite.exec('ALTER TABLE runs ADD COLUMN stage_order TEXT');
    sqlite.exec('INSERT INTO migrations(version) VALUES (4)');
  }).immediate();
  sqlite.transaction(() => {
    if (sqlite.prepare('SELECT 1 FROM migrations WHERE version = 5').get()) return;
    sqlite.exec(`CREATE TABLE IF NOT EXISTS discord_identities (
      discord_id TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE REFERENCES players(id),
      name TEXT NOT NULL, avatar TEXT, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS discord_sessions (
        token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL REFERENCES discord_identities(discord_id),
        instance_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS discord_session_expiry ON discord_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS discord_reminders (
        guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL, last_error TEXT);
      CREATE TABLE IF NOT EXISTS discord_deliveries (
        guild_id TEXT NOT NULL REFERENCES discord_reminders(guild_id), date TEXT NOT NULL,
        channel_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        next_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
        message_id TEXT, last_error TEXT, PRIMARY KEY(guild_id,date));
      CREATE TABLE IF NOT EXISTS discord_interactions (id TEXT PRIMARY KEY, reply TEXT NOT NULL, expires_at INTEGER NOT NULL);
      INSERT INTO migrations(version) VALUES (5);`);
  }).immediate();
  return { sqlite, orm: drizzle(sqlite, { schema }) };
}
export type Store = ReturnType<typeof openDatabase>;

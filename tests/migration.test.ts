import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../apps/api/src/db.js';
import { compilePackets } from '../scripts/content.js';
import { game } from '../apps/api/src/game.js';
it('migrates a legacy run to a pinned version without deleting its answers', () => {
  const temp = mkdtempSync(join(tmpdir(), 'nyambung-migration-'));
  const path = join(temp, 'legacy.sqlite');
  const seed = openDatabase(':memory:'); const packet = compilePackets(seed, '2026-10-22', true)[0]; seed.sqlite.close();
  const legacy = new Database(path);
  legacy.exec(`CREATE TABLE migrations (version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES (1);
    CREATE TABLE players (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE daily (date TEXT PRIMARY KEY, number INTEGER NOT NULL, demo INTEGER NOT NULL, snapshot TEXT NOT NULL, published_at TEXT NOT NULL);
    CREATE TABLE runs (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), date TEXT NOT NULL REFERENCES daily(date), completed_at TEXT);
    CREATE UNIQUE INDEX one_daily_run ON runs(player_id,date);
    CREATE TABLE answers (run_id TEXT NOT NULL REFERENCES runs(id), stage INTEGER NOT NULL, result TEXT NOT NULL, PRIMARY KEY(run_id,stage));`);
  legacy.prepare('INSERT INTO players VALUES (?,?)').run('player', packet.publishedAt);
  legacy.prepare('INSERT INTO daily VALUES (?,?,?,?,?)').run(packet.date, packet.number, 1, packet.snapshot, packet.publishedAt);
  legacy.prepare('INSERT INTO runs VALUES (?,?,?,NULL)').run('legacy', 'player', packet.date);
  legacy.prepare('INSERT INTO answers VALUES (?,?,?)').run('legacy', 0, JSON.stringify({ index: 0, kind: 'bridge2', clues: ['makanan', 'mall'], word: 'restoran', score: 1000, connections: [1, 1], best: 'restoran', explanation: 'Restoran menyajikan makanan.', skipped: false }));
  legacy.close();
  const store = openDatabase(path);
  try {
    const service = game(store, () => new Date('2026-10-22T12:00:00Z'));
    const run = service.view('legacy', 'player');
    expect(run.total).toBe(1000); expect(run.current?.index).toBe(1); expect(run.demo).toBe(true);
    expect(service.submit('legacy', 'player', { stage: 1, word: 'payung' }).total).toBe(2000);
  } finally { store.sqlite.close(); rmSync(temp, { recursive: true, force: true }); }
});

it('repairs an already-applied v3 database missing stage_order without losing progress', async () => {
  const { publish, compileRandomPool, publishRandomPool } = await import('../scripts/content.js');
  const { createApp } = await import('../apps/api/src/app.js');
  const temp = mkdtempSync(join(tmpdir(), 'nyambung-v3-repair-'));
  const path = join(temp, 'existing.sqlite');
  let store = openDatabase(path);
  try {
    const clock = () => new Date('2026-10-22T12:00:00Z');
    publish(store, compilePackets(store, '2026-10-22', true));
    publishRandomPool(store, compileRandomPool(store, true), true);
    const service = game(store, clock);
    const player = service.createPlayer();
    const before = service.start(player);
    service.submit(before.id, player, { stage:0, word:'restoran' });
    store.sqlite.close();
    const legacy = new Database(path);
    legacy.exec('ALTER TABLE runs DROP COLUMN stage_order; DELETE FROM migrations WHERE version > 3;');
    legacy.close();
    store = openDatabase(path);
    expect(store.sqlite.pragma('table_info(runs)')).toEqual(expect.arrayContaining([expect.objectContaining({ name:'stage_order' })]));
    expect(store.sqlite.pragma('foreign_key_check')).toEqual([]);
    const app = createApp(store, clock);
    const headers = { Cookie:`nyambung_session=${player}` };
    const dailyResponse = await app.request('http://localhost/api/daily', { headers });
    expect(dailyResponse.status).toBe(200);
    expect((await dailyResponse.json()).run).toMatchObject({ id:before.id, total:1000, current:{ index:1 } });
    const randomResponse = await app.request('http://localhost/api/random', { headers });
    expect(randomResponse.status).toBe(200);
    const randomStart = await app.request('http://localhost/api/random/runs', { method:'POST', headers });
    expect(randomStart.status).toBe(200);
    expect((await randomStart.json()).mode).toBe('random');
    store.sqlite.close(); store = openDatabase(path);
    expect(store.sqlite.prepare('SELECT COUNT(*) AS count FROM migrations WHERE version = 4').get()).toEqual({ count:1 });
    expect(game(store, clock).view(before.id, player).total).toBe(1000);
  } finally { if (store.sqlite.open) store.sqlite.close(); rmSync(temp, { recursive:true, force:true }); }
});

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

it('repairs a v5 database missing Discord interaction cache while preserving identities and progress', () => {
  const temp = mkdtempSync(join(tmpdir(), 'nyambung-v5-repair-'));
  const path = join(temp, 'existing.sqlite');
  let store = openDatabase(path);
  try {
    const service = game(store, () => new Date('2026-10-22T12:00:00Z'));
    const player = service.createPlayer();
    store.sqlite.prepare('INSERT INTO discord_identities VALUES (?,?,?,?,?)').run('123456789', player, 'Hafizh', 'avatar-hash', 1);
    store.sqlite.prepare('INSERT INTO discord_sessions VALUES (?,?,?,?)').run('session-hash', '123456789', 'room-one', 9999999999999);
    const packet = compilePackets(store, '2026-10-22', true)[0];
    store.sqlite.prepare('INSERT INTO daily VALUES (?,?,?,?,?)').run(packet.date, packet.number, 1, packet.snapshot, packet.publishedAt);
    const run = service.start(player);
    service.submit(run.id, player, { stage:0, word:'restoran' });
    store.sqlite.exec('DROP TABLE discord_interactions; DELETE FROM migrations WHERE version = 6;');
    store.sqlite.close();
    store = openDatabase(path);
    expect(store.sqlite.prepare('SELECT version FROM migrations WHERE version = 6').get()).toEqual({ version:6 });
    store.sqlite.prepare('INSERT INTO discord_interactions VALUES (?,?,?)').run('interaction-one', '{"type":12}', 9999999999999);
    expect(store.sqlite.prepare('SELECT name,avatar FROM discord_identities WHERE discord_id=?').get('123456789')).toEqual({ name:'Hafizh', avatar:'avatar-hash' });
    expect(store.sqlite.prepare('SELECT instance_id FROM discord_sessions WHERE token_hash=?').get('session-hash')).toEqual({ instance_id:'room-one' });
    expect(game(store).view(run.id, player).total).toBe(1000);
    expect(store.sqlite.pragma('foreign_key_check')).toEqual([]);
    store.sqlite.close(); store = openDatabase(path);
    expect(store.sqlite.prepare('SELECT reply FROM discord_interactions WHERE id=?').get('interaction-one')).toEqual({ reply:'{"type":12}' });
    expect(game(store).view(run.id, player).total).toBe(1000);
  } finally { if (store.sqlite.open) store.sqlite.close(); rmSync(temp, { recursive:true, force:true }); }
});

it('reuses the latest existing live message when migrating to one card per channel',()=>{
  const temp=mkdtempSync(join(tmpdir(),'nyambung-card-migration-'));const path=join(temp,'existing.sqlite');
  let store=openDatabase(path);
  try{
    store.sqlite.exec('DROP TABLE discord_channel_cards;DELETE FROM migrations WHERE version>=8;');
    const insert=store.sqlite.prepare("INSERT INTO discord_channel_reports(channel_id,date,kind,guild_id,message_id,uncertain) VALUES (?,?,'live',?,?,?)");
    insert.run('channel-one','2026-10-23','guild-one','older-message',0);
    insert.run('channel-one','2026-10-24','guild-one','latest-message',0);
    insert.run('channel-two','2026-10-24','guild-two',null,1);
    store.sqlite.close();store=openDatabase(path);
    expect(store.sqlite.prepare('SELECT channel_id,message_id,uncertain FROM discord_channel_cards ORDER BY channel_id').all()).toEqual([{channel_id:'channel-one',message_id:'latest-message',uncertain:0},{channel_id:'channel-two',message_id:null,uncertain:1}]);
    store.sqlite.close();store=openDatabase(path);
    expect(store.sqlite.prepare('SELECT count(*) AS n FROM discord_channel_cards').get()).toEqual({n:2});
  }finally{if(store.sqlite.open)store.sqlite.close();rmSync(temp,{recursive:true,force:true});}
});

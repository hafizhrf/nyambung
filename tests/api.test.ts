import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type Store } from '../apps/api/src/db.js';
import { createApp } from '../apps/api/src/app.js';
import { compilePackets, publish } from '../scripts/content.js';
import { daily, embeddings } from '../apps/api/src/schema.js';
import { game } from '../apps/api/src/game.js';
import type { Snapshot } from '../apps/api/src/scoring.js';
let store: Store;
let app: ReturnType<typeof createApp>;
let now: Date;
let cookie: string;
async function request(path: string, body?: unknown, as = cookie) {
  const response = await app.request(`http://localhost/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(as ? { Cookie: as } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
beforeEach(async () => {
  store = openDatabase(':memory:'); now = new Date('2026-10-22T12:00:00Z');
  publish(store, compilePackets(store, '2026-10-22', true)); app = createApp(store, () => now);
  cookie = (await request('/daily', undefined, '')).cookie!;
});
afterEach(() => store.sqlite.close());
describe('daily API', () => {
  it('has fourteen fixed daily packets and never leaks unopened answers', async () => {
    expect(store.orm.select().from(daily).all()).toHaveLength(14);
    const d = await request('/daily'); expect(d.json.available).toBe(true); expect(d.json.demo).toBe(true);
    const run = (await request('/runs', {})).json;
    expect(run.current.clues).toEqual(['makanan', 'mall']); expect(run.current).not.toHaveProperty('best');
    expect(JSON.stringify(run)).not.toContain('restoran'); expect(run).not.toHaveProperty('snapshot');
    expect((await request('/runs', {})).json.id).toBe(run.id);
  });
  it('rejects unknown words, clues, aliases of clues, and multiword input without consuming a turn', async () => {
    const run = (await request('/runs', {})).json;
    for (const word of ['xyzzy', 'makanan', 'mal', 'dua kata', 'kontol', '__proto__']) expect((await request(`/runs/${run.id}/answers`, { stage: 0, word })).status).toBe(400);
    expect((await request(`/runs/${run.id}`)).json.results).toHaveLength(0);
    const answer = await request(`/runs/${run.id}/answers`, { stage: 0, word: ' ReSTO ' });
    expect(answer.json.results[0].word).toBe('restoran'); expect(answer.json.results[0].score).toBe(1000);
    expect(JSON.stringify(answer.json)).not.toContain('payung');
  });
  it('is idempotent across repeated and competing submissions', async () => {
    const run = (await request('/runs', {})).json;
    const first = await request(`/runs/${run.id}/answers`, { stage: 0, word: 'restoran' });
    const repeated = await request(`/runs/${run.id}/answers`, { stage: 0, word: 'batu' });
    expect(repeated.json).toEqual(first.json);
    expect((await request(`/runs/${run.id}/answers`, { stage: 3, word: 'biru' })).status).toBe(409);
    expect(first.json.total).toBe(1000);
  });
  it('supports all five stages and skip, computes stats, and protects run ownership', async () => {
    const run = (await request('/runs', {})).json;
    for (const [stage, word] of ['restoran', 'payung', '', 'biru', 'senang'].entries()) {
      const response = await request(`/runs/${run.id}/answers`, { stage, word, skip: !word }); expect(response.status).toBe(200);
    }
    const final = (await request(`/runs/${run.id}`)).json;
    expect(final.completed).toBe(true); expect(final.current).toBeNull(); expect(final.total).toBe(4000);
    expect((await request('/me/stats')).json).toEqual({ completed: 1, streak: 1, best: 4000, average: 4000 });
    const other = (await request('/daily', undefined, '')).cookie!;
    expect((await request(`/runs/${run.id}`, undefined, other)).status).toBe(404);
    expect((await request(`/runs/${run.id}/answers`, { stage: 0, word: 'restoran' }, other)).status).toBe(404);
  });
  it('keeps the old package after midnight and does not invent missing days', async () => {
    const old = (await request('/runs', {})).json; now = new Date('2026-10-22T17:00:00Z');
    expect((await request('/daily')).json.date).toBe('2026-10-23');
    expect((await request(`/runs/${old.id}/answers`, { stage: 0, word: 'restoran' })).json.total).toBe(1000);
    expect((await request('/runs', {})).json.current.clues).toEqual(['kopi', 'pagi']);
    now = new Date('2027-01-01T00:00:00Z');
    expect((await request('/daily')).json.available).toBe(false); expect((await request('/runs', {})).status).toBe(404);
  });
  it('publishes atomically, forbids changed snapshots, and ignores later embedding changes', async () => {
    const packets = compilePackets(store, '2026-10-22', true);
    publish(store, packets);
    const modified = [...packets].reverse(); modified[1] = { ...modified[1], date: '2027-01-01' }; modified[2] = { ...modified[2], snapshot: '{}' };
    expect(() => publish(store, modified)).toThrow('sudah diterbitkan');
    expect(store.orm.select().from(daily).where(eq(daily.date, '2027-01-01')).get()).toBeUndefined();
    const snapshot = store.orm.select().from(daily).get()!.snapshot;
    store.orm.insert(embeddings).values({ word: 'restoran', model: 'different', vector: '[0,1]' }).run();
    expect(store.orm.select().from(daily).get()!.snapshot).toBe(snapshot);
  });
  it('rejects foreign origins and malformed input', async () => {
    const response = await app.request('http://localhost/api/runs', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: cookie } });
    expect(response.status).toBe(403);
    const run = (await request('/runs', {})).json;
    expect((await request(`/runs/${run.id}/answers`, { stage: -1 })).status).toBe(400);
  });
  it('accepts the configured HTTPS origin behind a reverse proxy', async () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://nyambung.example.com');
    try {
      const response = await app.request('http://localhost/api/runs', { method: 'POST', headers: { Origin: 'https://nyambung.example.com', Cookie: cookie } });
      expect(response.status).toBe(200);
    } finally { vi.unstubAllEnvs(); }
  });
  it('accepts the two Vite development origins when the API sees its own address', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('PUBLIC_ORIGIN', '');
    try {
      for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
        const response = await app.request('http://127.0.0.1:3000/api/runs', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
        expect(response.status).toBe(200);
        const run = await response.json();
        const answer = await app.request(`http://127.0.0.1:3000/api/runs/${run.id}/answers`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 0, word: 'restoran' }) });
        expect(answer.status).toBe(200);
      }
      for (const origin of ['http://localhost:5174', 'http://localhost.evil.example:5173', 'null']) {
        const response = await app.request('http://127.0.0.1:3000/api/runs', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
        expect(response.status).toBe(403);
      }
    } finally { vi.unstubAllEnvs(); }
  });
  it('does not allow the Vite exception in production or with a configured public origin', async () => {
    try {
      for (const config of [{ mode: 'production', origin: '' }, { mode: 'development', origin: 'https://nyambung.example.com' }]) {
        vi.stubEnv('NODE_ENV', config.mode); vi.stubEnv('PUBLIC_ORIGIN', config.origin);
        for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
          const response = await app.request('http://127.0.0.1:3000/api/runs', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
          expect(response.status).toBe(403);
        }
      }
    } finally { vi.unstubAllEnvs(); }
  });
  it('tracks streak by puzzle date rather than time of submission', async () => {
    const service = game(store, () => now); const player = service.createPlayer();
    function finish() { const run = service.start(player); for (let stage = 0; stage < 5; stage++) service.submit(run.id, player, { stage, skip: true }); }
    finish(); now = new Date('2026-10-23T12:00:00Z'); finish();
    expect(service.stats(player).streak).toBe(2);
    now = new Date('2026-10-24T12:00:00Z'); expect(service.stats(player).streak).toBe(2);
    now = new Date('2026-10-25T12:00:00Z'); expect(service.stats(player).streak).toBe(0);
  });
});

describe('semantic edition upgrade', () => {
  it('accepts broader scored words while preserving the original demo run and replies', async () => {
    const old = (await request('/runs', {})).json;
    await request(`/runs/${old.id}/answers`, { stage: 0, word: 'restoran' });
    const packets = compilePackets(store, '2026-10-22', true);
    const snapshot = JSON.parse(packets[0].snapshot) as Snapshot;
    snapshot.model = 'semantic-test';
    snapshot.stages[0].scores.warung = { score: 783, connections: [.73, .84], similarities: [.31, .27], rank: 42, vocabularySize: 32000 };
    const upgraded = [{ ...packets[0], demo: false, snapshot: JSON.stringify(snapshot) }];
    expect(() => publish(store, upgraded)).toThrow('sudah diterbitkan');
    publish(store, upgraded, true);
    const current = (await request('/runs', {})).json;
    expect(current.id).not.toBe(old.id); expect(current.demo).toBe(false);
    expect((await request(`/runs/${old.id}`)).json.total).toBe(1000);
    expect((await request(`/runs/${old.id}`)).json.demo).toBe(true);
    const answer = (await request(`/runs/${current.id}/answers`, { stage: 0, word: 'warung' })).json;
    expect(answer.results[0]).toMatchObject({ score: 783, rank: 42, similarities: [.31, .27], vocabularySize: 32000 });
    expect((await request('/runs', {})).json.id).toBe(current.id);
    // Semantic editions cannot be overwritten through the demo-only upgrade path.
    const changed = [{ ...upgraded[0], snapshot: '{}' }];
    expect(() => publish(store, changed, true)).toThrow('sudah diterbitkan');
  });
});

describe('random mode and daily comparison', () => {
  it('resumes random runs, preserves daily progress and starts a new game after finishing', async () => {
    const { compileRandomPool, publishRandomPool } = await import('../scripts/content.js');
    publishRandomPool(store, compileRandomPool(store, true), true);
    const dailyRun = (await request('/runs', {})).json;
    const first = (await request('/random/runs', {})).json;
    expect(first.mode).toBe('random'); expect(first.current.kind).toBe('bridge2');
    expect(Object.keys(first.current).sort()).toEqual(['clues', 'index', 'kind']);
    expect((await request('/random/runs', {})).json.id).toBe(first.id);
    expect((await request('/daily')).json.run.id).toBe(dailyRun.id);
    for (let stage = 0; stage < 5; stage++) {
      const answer = (await request(`/runs/${first.id}/answers`, { stage, skip:true })).json;
      if (stage < 4) expect(answer.current.kind).toBe(stage < 2 ? 'bridge2' : stage === 2 ? 'bridge3' : 'closest');
    }
    expect((await request('/me/stats')).json).toEqual({ completed:0, streak:0, best:0, average:0 });
    expect((await request(`/runs/${first.id}/comparison`)).status).toBe(400);
    const second = (await request('/random/runs', {})).json;
    expect(second.id).not.toBe(first.id);
    expect((await request(`/runs/${first.id}`)).json.completed).toBe(true);
    expect((await request('/random')).json.run.id).toBe(second.id);
    const other = (await request('/daily', undefined, '')).cookie!;
    expect((await request(`/runs/${second.id}`, undefined, other)).status).toBe(404);
    now = new Date('2027-01-01T00:00:00Z');
    expect((await request('/daily')).json.available).toBe(false);
    expect((await request('/random/runs', {}, other)).status).toBe(200);
  });
  it('does not invent random puzzles when the pool has not been published', async () => {
    expect((await request('/random')).json).toEqual({ available:false, run:null });
    expect((await request('/random/runs', {})).status).toBe(404);
  });
  it('pins random stage selection and scores even after a new pool is published', async () => {
    const { compileRandomPool, publishRandomPool } = await import('../scripts/content.js');
    const snapshot = compileRandomPool(store, true);
    publishRandomPool(store, snapshot, true);
    const run = (await request('/random/runs', {})).json;
    const selected = snapshot.stages.find(stage => stage.clues.join(',') === run.current.clues.join(','))!;
    const replacement = structuredClone(snapshot);
    for (const stage of replacement.stages) stage.scores[stage.best].score = 123;
    publishRandomPool(store, replacement, true);
    const response = await request(`/runs/${run.id}/answers`, { stage:0, word:selected.best });
    expect(response.json.results[0].score).toBe(1000);
    const retry = await request(`/runs/${run.id}/answers`, { stage:0, skip:true });
    expect(retry.json).toEqual(response.json);
  });
  it('compares completed players on the same daily edition, with shared ranks for ties', async () => {
    const packet = compilePackets(store, '2026-10-22', true)[0];
    publish(store, [{ ...packet, demo:false, snapshot:JSON.stringify({ ...JSON.parse(packet.snapshot), model:'test-semantic' }) }], true);
    const service = game(store, () => now);
    const finish = (skipFirst:boolean) => {
      const player = service.createPlayer(); const run = service.start(player);
      for (const [stage, word] of ['restoran','payung','kertas','biru','senang'].entries()) service.submit(run.id, player, { stage, word, skip:skipFirst && stage === 0 });
      return { player, run };
    };
    const top = finish(false), lower = finish(true), tied = finish(true);
    const unfinished = service.createPlayer(), pending = service.start(unfinished);
    expect(service.comparison(top.run.id, top.player)).toEqual({ players:3, average:4333, best:5000, rank:1, abovePercent:100 });
    expect(service.comparison(lower.run.id, lower.player)).toMatchObject({ players:3, rank:2, abovePercent:0 });
    expect(service.comparison(tied.run.id, tied.player).rank).toBe(2);
    expect(service.comparison(pending.id, unfinished).rank).toBeNull();
    // Other dates, random games, and superseded editions must never inflate the cohort.
    now = new Date('2026-10-23T12:00:00Z'); finish(false);
    expect(service.comparison(top.run.id, top.player).players).toBe(3);
    expect((await request(`/runs/${top.run.id}/comparison`)).status).toBe(404);
  });
  it('has honest empty and single-player daily comparisons', async () => {
    const packet = compilePackets(store, '2026-10-22', true)[0];
    publish(store, [{ ...packet, demo:false, snapshot:JSON.stringify({ ...JSON.parse(packet.snapshot), model:'test-semantic' }) }], true);
    const run = (await request('/runs', {})).json;
    expect((await request(`/runs/${run.id}/comparison`)).json).toEqual({ players:0, average:0, best:0, rank:null, abovePercent:null });
    for (let stage = 0; stage < 5; stage++) await request(`/runs/${run.id}/answers`, { stage, skip:true });
    expect((await request(`/runs/${run.id}/comparison`)).json).toEqual({ players:1, average:0, best:0, rank:1, abovePercent:null });
  });
});

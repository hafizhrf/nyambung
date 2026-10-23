import { expect, it } from 'vitest';
import { bridgeSeparation, areSynonyms } from '../apps/api/src/bridge-quality.js';
import { packVectors } from '../apps/api/src/vector-index.js';
import { retrieveCandidates } from '../apps/api/src/retrieval.js';
import { evaluateRound, type RandomGenerator } from '../apps/api/src/random-generator.js';
import { trainDifficulty } from '../apps/api/src/adaptive.js';
import { sameWordFamily } from '../apps/api/src/word-family.js';
import { openDatabase } from '../apps/api/src/db.js';
import { compilePackets, publish, refreshUpcoming, compileRandomPool, publishRandomPool, requalifyPublishedRandomPool, retireUnstartedTrivialRuns } from '../scripts/content.js';
import { game } from '../apps/api/src/game.js';
import { dailyBridges } from '../content/daily-bridges.js';

function fixture(): RandomGenerator {
  const entries: [string, number[]][] = [['pengatur', [1, 0, 0]], ['pengontrol', [.98, .02, 0]], ['regulator', [1, .01, 0]], ['pintu', [0, 1, 0]], ['musik', [0, 0, 1]], ['kunci', [0, 1, 1]]];
  const words = entries.map(([word]) => word);
  return { version: 4, words, answers: ['regulator', 'kunci'], packed: packVectors(words, new Map(entries)), profiles: [], excludedCombos: [], relations: [
    { answer: 'regulator', facets: [['pengatur'], ['pengontrol']] },
    { answer: 'kunci', facets: [['pintu'], ['musik']] },
  ] };
}
it('rejects near-identical clues, keeps a meaningful cross-context bridge and still replays old rounds', () => {
  const data = fixture();
  expect(bridgeSeparation(data, ['pengatur', 'pengontrol'], 'regulator').accepted).toBe(false);
  expect(bridgeSeparation(data, ['pintu', 'musik'], 'kunci').accepted).toBe(true);
  const candidates = retrieveCandidates(data, 'bridge2', trainDifficulty([]), new Set());
  expect(candidates.map(candidate => candidate.answer)).toEqual(['kunci']);
  // Selection policy must not retroactively invalidate an already stored round.
  expect(evaluateRound(data, { kind: 'bridge2', clues: ['pengatur', 'pengontrol'], target: 'regulator' })?.best).toBe('regulator');
});
it('filters known synonyms independently of embedding confidence and avoids substring false positives', () => {
  expect(areSynonyms('senang', 'gembira')).toBe(true);
  expect(sameWordFamily('bunga', 'tabungan')).toBe(false);
  expect(sameWordFamily('intelek', 'intelektual')).toBe(true);
  expect(sameWordFamily('bertinju', 'meninju')).toBe(true);
  // These closely related forms fooled the real embedding; lexical evidence
  // rejects them even without consulting a vector index.
  const missingVectors: RandomGenerator = { version: 4, words: [], answers: [], profiles: [], excludedCombos: [] };
  expect(bridgeSeparation(missingVectors, ['jenggot', 'misai'], 'kumis').accepted).toBe(false);
  expect(bridgeSeparation(missingVectors, ['ulat', 'bernga'], 'belatung').accepted).toBe(false);
});
it('retires only unanswered trivial random sessions and does not overwrite their frozen editions', () => {
  const store = openDatabase(':memory:');
  try {
    const snapshot = compileRandomPool(store, true); snapshot.generator = fixture(); publishRandomPool(store, snapshot, true);
    const versionId = (store.sqlite.prepare("SELECT version_id FROM random_pool WHERE id='active'").get() as {version_id:string}).version_id;
    const before = store.sqlite.prepare('SELECT snapshot FROM puzzle_versions WHERE id=?').get(versionId);
    const service = game(store), players = [service.createPlayer(), service.createPlayer()];
    const order = JSON.stringify({ generator: 1, rounds: [{ kind: 'bridge2', clues: ['pengatur', 'pengontrol'], target: 'regulator' }] });
    for (const [i, player] of players.entries()) store.sqlite.prepare("INSERT INTO runs(id,player_id,date,mode,version_id,stage_order) VALUES (?,?,'2026-10-23','random',?,?)").run(`run-${i}`, player, versionId, order);
    store.sqlite.prepare('INSERT INTO answers(run_id,stage,result) VALUES (?,?,?)').run('run-1', 0, JSON.stringify({ score: 1000 }));
    const revised = requalifyPublishedRandomPool(store); expect(revised.generator?.bridgePolicy).toBe('cross-context-v1');
    expect(store.sqlite.prepare('SELECT snapshot FROM puzzle_versions WHERE id=?').get(versionId)).toEqual(before);
    expect(retireUnstartedTrivialRuns(store)).toBe(1);
    expect((store.sqlite.prepare('SELECT superseded_at FROM runs WHERE id=?').get('run-0') as any).superseded_at).not.toBeNull();
    expect(store.sqlite.prepare('SELECT superseded_at FROM runs WHERE id=?').get('run-1')).toEqual({ superseded_at: null });
    expect(store.sqlite.prepare('SELECT result FROM answers WHERE run_id=?').get('run-1')).toEqual({ result: JSON.stringify({ score: 1000 }) });
  } finally { store.sqlite.close(); }
});
it('limits both the strongest clue pair and the mean proximity in a three-clue round', () => {
  const data: RandomGenerator = { version: 3, words: ['pintu', 'musik', 'jawaban', 'kunci'], answers: ['kunci'], profiles: ['pintu', 'musik', 'jawaban'].map(word => ({ word, baseline: 0, reference: 1, similarities: [.11, .11, .11, .5] })), excludedCombos: [] };
  expect(bridgeSeparation(data, ['pintu', 'musik', 'jawaban'], 'kunci').accepted).toBe(false);
  data.profiles[0].similarities[1] = .03; data.profiles[0].similarities[2] = .03;
  expect(bridgeSeparation(data, ['pintu', 'musik', 'jawaban'], 'kunci').accepted).toBe(true);
});
it('provides fourteen complete bridge sets across different contexts', () => {
  expect(dailyBridges).toHaveLength(14);
  const keys = new Set<string>();
  for (const day of dailyBridges) {
    expect(day.map(stage => stage.kind)).toEqual(['bridge2', 'bridge2', 'bridge2', 'bridge3']);
    expect(new Set(day.map(stage => stage.best)).size).toBe(4);
    for (const stage of day) {
      const key = [...stage.clues].sort().join('|'); expect(keys.has(key)).toBe(false); keys.add(key);
      expect(stage.explanation.length).toBeGreaterThan(20);
    }
  }
});
it('revises only unstarted future daily packages, atomically, preserving current results and pinned snapshots', () => {
  const store = openDatabase(':memory:');
  try {
    const packets = compilePackets(store, '2026-10-22', true); publish(store, packets);
    const service = game(store, () => new Date('2026-10-22T12:00:00Z'));
    const player = service.createPlayer(), run = service.start(player);
    const saved = service.submit(run.id, player, { stage: 0, word: 'restoran' });
    const replacement = packets.map(packet => ({ ...packet, number: packet.number + 100 }));
    expect(refreshUpcoming(store, replacement, '2026-10-22')).toBe(13);
    expect(service.view(run.id, player)).toEqual(saved);
    expect(store.sqlite.prepare('SELECT number FROM daily WHERE date=?').get('2026-10-22')).toEqual({ number: 1 });
    const tomorrow = game(store, () => new Date('2026-10-23T12:00:00Z')); tomorrow.start(player);
    const before = store.sqlite.prepare('SELECT date,snapshot,number FROM daily').all();
    expect(() => refreshUpcoming(store, packets, '2026-10-22')).toThrow('sudah memiliki sesi');
    expect(store.sqlite.prepare('SELECT date,snapshot,number FROM daily').all()).toEqual(before);
  } finally { store.sqlite.close(); }
});

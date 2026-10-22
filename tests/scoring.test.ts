import { describe, expect, it } from 'vitest';
import { cosine, combine, compileStage, centerVectors } from '../apps/api/src/scoring.js';
import { addDays, wibDate, nextReset } from '../apps/api/src/time.js';
import { normalizeWord } from '@nyambung/shared';
describe('scoring and WIB', () => {
  it('measures cosine and rejects incompatible embeddings', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1); expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(() => cosine([1], [1, 2])).toThrow(); expect(() => cosine([0], [0])).toThrow();
  });
  it('rewards balanced connections with a harmonic mean', () => {
    expect(combine([1, 1])).toBe(1000); expect(combine([1, 0])).toBe(0);
    expect(combine([.7, .7])).toBeGreaterThan(combine([1, .3])); expect(combine([.8])).toBe(800);
    expect(combine([1, 1, 0])).toBe(500); expect(combine([0, 0, 0])).toBe(0);
  });
  it('normalizes each clue against a percentile baseline and best answer', () => {
    const vectors = new Map([['makanan', [1, 0, 0]], ['mall', [0, 1, 0]], ['restoran', [1, 1, 0]], ['batu', [0, 0, 1]], ['kursi', [0, 0, 1]], ['nongkrong', [0, 1, 1]]]);
    const stage = compileStage({ kind: 'bridge2', clues: ['makanan', 'mall'], best: 'restoran', explanation: 'Contoh koneksi yang direview.', overrides: { nongkrong: [.72, .82] } }, [...vectors.keys()], vectors);
    expect(stage.scores.restoran.score).toBe(1000); expect(stage.scores.batu.score).toBe(0);
    expect(stage.scores.nongkrong.score).toBeGreaterThan(700); expect(stage.scores).not.toHaveProperty('makanan');
    expect(Object.values(stage.scores).every(s => s.score >= 0 && s.score <= 1000)).toBe(true);
  });
  it('changes the day exactly at 00:00 WIB, including year boundary', () => {
    expect(wibDate(new Date('2026-10-22T16:59:59Z'))).toBe('2026-10-22');
    expect(wibDate(new Date('2026-10-22T17:00:00Z'))).toBe('2026-10-23');
    expect(nextReset(new Date('2026-12-31T16:00:00Z'))).toBe('2026-12-31T17:00:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('normalizes casing and whitespace without stemming', () => { expect(normalizeWord('  ReSToran ')).toBe('restoran'); expect(normalizeWord('makanan')).toBe('makanan'); });
});
it('does not saturate the vocabulary when the editorial best is weak in the model', () => {
  const vocabulary = ['clue', 'best', ...Array.from({ length: 100 }, (_, i) => `word${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`)];
  const vectors = new Map<string, number[]>([['clue', [1, 0]], ['best', [.1, 1]]]);
  vocabulary.slice(2).forEach((word, index) => vectors.set(word, [.15 + index / 100, 1]));
  const result = compileStage({ kind: 'closest', clues: ['clue'], best: 'best', explanation: 'An editorial best with an unusual sense.', overrides: {} }, vocabulary, vectors);
  expect(result.scores.best.score).toBe(1000);
  expect(Object.values(result.scores).filter(entry => entry.score === 1000).length).toBeLessThan(5);
  expect(new Set(Object.values(result.scores).map(entry => entry.score)).size).toBeGreaterThan(50);
});

it('removes shared context without mutating cached provider vectors', () => {
  const original = new Map([['a', [10, 1]], ['b', [10, -1]]]);
  const centered = centerVectors(original, ['a', 'b']);
  expect(centered.get('a')).toEqual([0, 1]); expect(centered.get('b')).toEqual([0, -1]);
  expect(original.get('a')).toEqual([10, 1]);
});

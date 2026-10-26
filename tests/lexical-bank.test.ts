import { expect, it, vi } from 'vitest';
import type { RandomGenerator } from '../apps/api/src/random-generator.js';
import { compileLexicalBank } from '../scripts/lexical-bank.js';

vi.mock('../content/wordnet-relations.json', () => ({ default: [
  { answer:'tahu', facets:[['kedelai'],['goreng']], source:'wordnet-bahasa', sense:'food' },
  { answer:'tahu', facets:[['informasi'],['belajar']], source:'wordnet-bahasa', sense:'knowledge' },
] }));
vi.mock('../apps/api/src/vector-index.js', () => ({
  semanticSimilarity: (_data: RandomGenerator, a: string, b: string) => a === 'tahu' || b === 'tahu' ? .4 : 0,
}));

it('retains separate eligible senses of one answer without mixing their clues', () => {
  const data: RandomGenerator = {
    version:4, words:['tahu','kedelai','goreng','informasi','belajar'],
    answers:[], relations:[], profiles:[], excludedCombos:[],
  };
  const { relations } = compileLexicalBank(data);
  expect(relations).toHaveLength(2);
  expect(relations.find(row => row.sense === 'food')?.facets).toEqual([['kedelai'],['goreng']]);
  expect(relations.find(row => row.sense === 'knowledge')?.facets).toEqual([['informasi'],['belajar']]);
});

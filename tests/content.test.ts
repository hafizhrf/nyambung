import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../apps/api/src/db.js';
import { compileStage } from '../apps/api/src/scoring.js';
import { embed, compilePackets, jinaCacheKey } from '../scripts/content.js';
import { embeddings } from '../apps/api/src/schema.js';
import { vocabulary } from '../content/puzzles.js';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('content pipeline', () => {
  it('validates editorial input and excludes misleading synonyms', () => {
    expect(() => compileStage({ kind: 'bridge3', clues: ['a', 'b'], best: 'c', explanation: 'A real explanation.', overrides: {} }, ['a', 'b', 'c'])).toThrow();
    const result = compileStage({ kind: 'closest', clues: ['cepat'], best: 'lekas', explanation: 'Lekas dekat dengan cepat.', overrides: {}, excluded: ['lambat'] }, ['cepat', 'lekas', 'lambat']);
    expect(result.scores.lambat.score).toBe(0); expect(result.scores.lekas.score).toBe(1000);
  });
  it('refuses semantic compilation when any vector is missing', () => {
    const store = openDatabase(':memory:');
    try { expect(() => compilePackets(store, '2026-10-22')).toThrow('Embedding belum lengkap'); expect(() => compilePackets(store, '2026-02-30', true)).toThrow(); } finally { store.sqlite.close(); }
  });
  it('batches Jina words, restores response order, and resumes from its own cache', async () => {
    const store = openDatabase(':memory:');
    vi.stubEnv('JINA_API_KEY', 'test-only-key'); vi.stubEnv('JINA_EMBEDDING_MODEL', 'jina-embeddings-v5-text-small');
    const words = ['warung', 'restoran', 'kantin'];
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: words.map((_, index) => ({ index, embedding: Array(512).fill(.1 + index * .1) })).reverse() }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher); vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      store.orm.insert(embeddings).values({ word: 'warung', model: 'gemini-embedding-2', vector: '[1,2]' }).run();
      await embed(store, words); await embed(store, words);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, config] = fetcher.mock.calls[0]; expect(url).toBe('https://api.jina.ai/v1/embeddings');
      const body = JSON.parse(config.body);
      expect(body).toMatchObject({ model: 'jina-embeddings-v5-text-small', task: 'text-matching', dimensions: 512, input: words.map(word => `Kata bahasa Indonesia: ${word}`) });
      const rows = store.orm.select().from(embeddings).all().filter(row => row.model === jinaCacheKey());
      expect(rows).toHaveLength(3);
      expect(JSON.parse(rows.find(row => row.word === 'warung')!.vector)[0]).toBe(.1);
    } finally { store.sqlite.close(); }
  });
  it('does not cache malformed provider output', async () => {
    const store = openDatabase(':memory:'); vi.stubEnv('JINA_API_KEY', 'test-only-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 0, embedding: [0] }] }), { status: 200 })));
    try { await expect(embed(store, ['warung'])).rejects.toThrow('Vektor tidak valid'); expect(store.orm.select().from(embeddings).all()).toHaveLength(0); } finally { store.sqlite.close(); }
  });
});
it('includes common alternatives and inflected words in a broad dictionary', () => {
  expect(vocabulary.length).toBeGreaterThanOrEqual(32000);
  for (const word of ['warung', 'kantin', 'kuliner', 'belanja', 'nongkrong', 'jualan', 'berjualan', 'hidangan', 'jajanan', 'kedai']) expect(vocabulary).toContain(word);
});

import { compileRandomSynonym } from '../apps/api/src/scoring.js';
it('keeps unreviewed synonym neighbours below curated answers even when a best vector is weak',()=>{
  const words=['akrab','dekat','karib','asing','abaka','lain'];
  const vectors=new Map<string,number[]>([
    ['akrab',[1,0]],['dekat',[.1,.99]],['karib',[.2,.98]],
    ['asing',[.95,.05]],['abaka',[.99,.01]],['lain',[0,1]],
  ]);
  const stage=compileRandomSynonym({kind:'closest',clues:['akrab'],best:'dekat',explanation:'Akrab berarti dekat dalam hubungan.',overrides:{karib:[.98]},excluded:['asing']},words,vectors);
  expect(stage.scores.dekat.score).toBe(1000);
  expect(stage.scores.karib.score).toBe(980);
  expect(stage.scores.abaka.score).toBeLessThan(950);
  expect(stage.scores.asing.score).toBe(0);
  expect(stage.scores.dekat.rank).toBe(1);
  expect(stage.scores.karib.rank).toBe(2);
});

import lexicalRelations from '../content/wordnet-relations.json';
import lexicalSynonyms from '../content/wordnet-synonyms.json';
it('ships an expanded, source-backed lexicon and keeps Wordnet senses separate',()=>{
 expect(vocabulary.length).toBeGreaterThanOrEqual(85000);
 expect(new Set(vocabulary).size).toBe(vocabulary.length);
 expect(vocabulary.every(word=>/^[a-z]{2,32}$/.test(word))).toBe(true);
 expect(lexicalRelations.length).toBeGreaterThan(10000);
 expect(lexicalSynonyms.length).toBeGreaterThan(10000);
 for(const row of lexicalRelations) {
  expect(row.source).toBe('wordnet-bahasa');expect(row.sense).toMatch(/^\d{8}-[nvar]$/);
  expect(row.facets.flat()).not.toContain(row.answer);
  expect(new Set(row.facets.flat()).size).toBe(row.facets.flat().length);
 }
 expect(lexicalRelations.filter(row=>row.answer==='besok').some(row=>row.facets.flat().includes('kemarin'))).toBe(false);
 expect(lexicalRelations.filter(row=>row.answer==='farmasi').some(row=>row.facets.flat().includes('butik'))).toBe(false);
});

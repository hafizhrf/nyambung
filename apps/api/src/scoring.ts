import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { StageKind } from '@nyambung/shared';
const wordSchema = z.string().regex(/^[a-z]+$/);
export const contentStageSchema = z.object({ kind: z.enum(['bridge2', 'bridge3', 'closest']), clues: z.array(wordSchema), best: wordSchema, explanation: z.string().min(10), overrides: z.record(wordSchema, z.array(z.number().min(0).max(1))), excluded: z.array(wordSchema).optional() }).superRefine((stage, ctx) => {
  const length = stage.kind === 'bridge2' ? 2 : stage.kind === 'bridge3' ? 3 : 1;
  if (stage.clues.length !== length || new Set(stage.clues).size !== length) ctx.addIssue({ code: 'custom', message: 'Jumlah clue tidak sesuai atau berulang.' });
  if (stage.clues.includes(stage.best) || stage.excluded?.includes(stage.best)) ctx.addIssue({ code: 'custom', message: 'Jawaban terbaik tidak valid.' });
  for (const [word, values] of Object.entries(stage.overrides)) if (values.length !== length || stage.excluded?.includes(word)) ctx.addIssue({ code: 'custom', message: `Koreksi ${word} tidak sesuai.` });
});
export type ContentStage = z.infer<typeof contentStageSchema>;
export interface ScoreEntry { score: number; connections: number[]; similarities?: number[]; rank?: number; vocabularySize?: number }
export interface PublishedStage extends ContentStage { concept?:string; scores: Record<string, ScoreEntry>; vocabularySize?: number }
export interface Snapshot { generator?: import('./random-generator.js').RandomGenerator; version: 1; model: string; formula: string; vocabularyHash: string; aliases: Record<string, string>; blocked: string[]; stages: PublishedStage[] }
export const FORMULA = 'centered-cosine-p10-p999-anchor-pow055/harmonic-weak3-v5';
export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) throw new Error('Embedding tidak kompatibel.');
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new Error('Embedding tidak kompatibel.'); dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  if (!aa || !bb) throw new Error('Embedding kosong.');
  return dot / Math.sqrt(aa * bb);
}
export function combine(values: number[]) {
  const connections = [...values];
  if (connections.length === 3) {
    const weakest = connections.indexOf(Math.min(...connections));
    connections[weakest] = .25 + .75 * connections[weakest];
  }
  if (connections.some(v => v <= 0)) return 0;
  return Math.round(1000 * connections.length / connections.reduce((sum, v) => sum + 1 / v, 0));
}
export function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
// Remove the shared language-context component before comparing word meanings.
// Original provider vectors remain unchanged in SQLite for reproducibility.
export function centerVectors(vectors: Map<string, number[]>, words: string[]) {
  const dimensions = vectors.get(words[0])?.length;
  if (!dimensions || !words.length) throw new Error('Kosakata embedding kosong.');
  const mean = Array(dimensions).fill(0) as number[];
  for (const word of words) {
    const vector = vectors.get(word);
    if (!vector || vector.length !== dimensions) throw new Error('Embedding tidak kompatibel.');
    for (let i = 0; i < dimensions; i++) mean[i] += vector[i] / words.length;
  }
  return new Map(words.map(word => [word, vectors.get(word)!.map((value, i) => value - mean[i])]));
}
export function compileStage(stage: ContentStage, vocabulary: string[], vectors?: Map<string, number[]>): PublishedStage {
  contentStageSchema.parse(stage);
  if (!vocabulary.includes(stage.best) || stage.clues.some(clue => !vocabulary.includes(clue)) || Object.keys(stage.overrides).some(word => !vocabulary.includes(word))) throw new Error('Kata stage belum masuk kosakata.');
  const scores: Record<string, ScoreEntry> = {};
  // Compute word/clue similarities once; never recompute the best vector per word.
  const similarities = stage.clues.map(clue => vectors ? vocabulary.map(word => cosine(vectors.get(word)!, vectors.get(clue)!)) : vocabulary.map(() => 0));
  const distributions = similarities.map(samples => [...samples].sort((a, b) => a - b));
  const baselines = distributions.map(samples => vectors ? samples[Math.floor(samples.length * .1)] : 0);
  const bestIndex = vocabulary.indexOf(stage.best);
  // A model can underrate an editorial answer (polysemy or rare words).
  // Never let that weak reference saturate thousands of unrelated words.
  const references = distributions.map((samples, i) => Math.max(similarities[i][bestIndex], samples[Math.floor(samples.length * .999)]));
  const denominators = references.map((reference, i) => reference - baselines[i]);
  if (vectors && denominators.some(value => value < .01)) throw new Error(`Clue ${stage.clues.join('/')} tidak terkalibrasi; pilih jawaban terbaik lain.`);
  for (const [index, word] of vocabulary.entries()) {
    if (stage.clues.includes(word)) continue;
    const raw = similarities.map(samples => samples[index]);
    let connections = raw.map((similarity, i) => vectors ? Math.pow(Math.max(0, Math.min(1, (similarity - baselines[i]) / denominators[i])), .55) : 0);
    const correction = Object.hasOwn(stage.overrides, word) ? stage.overrides[word] : undefined;
    if (correction) connections = connections.map((value, i) => Math.max(value, correction[i]));
    if (word === stage.best) connections = stage.clues.map(() => 1);
    // Valid antonyms/unsuitable senses earn zero instead of being rejected as unknown.
    if (stage.excluded?.includes(word)) connections = stage.clues.map(() => 0);
    scores[word] = { score: combine(connections), connections: connections.map(v => Math.round(v * 1000) / 1000), ...(vectors ? { similarities: raw.map(v => Math.round(v * 1000) / 1000) } : {}) };
  }
  const sorted = Object.values(scores).sort((a, b) => b.score - a.score);
  let rank = 1;
  sorted.forEach((entry, index) => {
    if (index && entry.score < sorted[index - 1].score) rank = index + 1;
    entry.rank = rank;
  });
  return { ...stage, scores, vocabularySize: sorted.length };
}

// Random synonym editions use a vocabulary percentile as the upper anchor.
// Anchoring to a weak best-vector could otherwise give thousands of words 1000.
export function compileRandomSynonym(stage:ContentStage, words:string[], vectors:Map<string,number[]>):PublishedStage {
  const published=compileStage(stage,words,vectors);
  const entries=Object.entries(published.scores);
  const distribution=entries.map(([,entry])=>entry.similarities![0]).sort((a,b)=>a-b);
  const baseline=distribution[Math.floor(distribution.length*.1)];
  const upper=distribution[Math.floor(distribution.length*.999)];
  const excluded=new Set(stage.excluded ?? []);
  for (const [word,entry] of entries) {
    const strength=Math.pow(Math.max(0,Math.min(1,(entry.similarities![0]-baseline)/Math.max(1e-9,upper-baseline))),.55);
    entry.score=excluded.has(word)?0:Math.round(949*strength);
    entry.connections=[excluded.has(word)?0:Math.round(strength*1000)/1000];
    if (!excluded.has(word) && stage.overrides[word]) {
      entry.connections=stage.overrides[word];entry.score=Math.round(1000*stage.overrides[word][0]);
    }
  }
  published.scores[stage.best].score=1000;
  published.scores[stage.best].connections=[1];
  const histogram=new Uint32Array(1001),ranks=new Uint32Array(1001);
  for(const [,entry] of entries) histogram[entry.score]++;
  let above=0;for(let score=1000;score>=0;score--) {ranks[score]=above+1;above+=histogram[score];}
  for(const [,entry] of entries) entry.rank=ranks[entry.score];
  return published;
}

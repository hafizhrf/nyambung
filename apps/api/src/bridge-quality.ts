import synonyms from '../../../content/wordnet-synonyms.json';
import relations from '../../../content/wordnet-relations.json';
import { hasWordFamilyCollision } from './word-family.js';
import { semanticSimilarity } from './vector-index.js';
import type { RandomGenerator } from './random-generator.js';

// Word families and synonyms belong in the last round, not in bridge clues.
// Keep this separate from scoring: existing run descriptors must still replay.
const senses = new Map<string, Set<number>>();
const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
const directEdges = new Set(relations.flatMap(row => row.facets.flat().map(clue => edgeKey(row.answer, clue))));
synonyms.forEach((group, index) => group.lemmas.forEach(word => {
  const values = senses.get(word) ?? new Set<number>(); values.add(index); senses.set(word, values);
}));
export function areSynonyms(a: string, b: string): boolean {
  const left = senses.get(a), right = senses.get(b);
  return !!left && !!right && [...left].some(sense => right.has(sense));
}
export function hasTrivialBridge(words: string[]): boolean {
  return hasWordFamilyCollision(words) || words.some((word, i) => words.slice(i + 1).some(other => areSynonyms(word, other) || directEdges.has(edgeKey(word, other))));
}
export function bridgeSeparation(data: RandomGenerator, clues: string[], answer: string) {
  return inspectBridge(clues, answer, (a, b) => semanticSimilarity(data, a, b));
}
export function inspectBridge(clues: string[], answer: string, similarity: (a: string, b: string) => number) {
  if (hasWordFamilyCollision([...clues, answer]) || hasTrivialBridge(clues)) return { accepted: false, maximum: 1, mean: 1, novelty: 0 };
  const pairs = clues.flatMap((clue, i) => clues.slice(i + 1).map(other => similarity(clue, other)));
  const maximum = pairs.length ? Math.max(...pairs) : 1;
  const mean = pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : 1;
  const accepted = (clues.length === 2 || clues.length === 3)
    && pairs.every(Number.isFinite)
    && maximum <= (clues.length === 2 ? .12 : .18)
    && mean <= (clues.length === 2 ? .12 : .1);
  return { accepted, maximum, mean, novelty: Math.max(0, Math.min(1, (.12 - mean) / .24)) };
}

// Hand-reviewed spelling variants of the same word (common non-standard ↔ KBBI form).
// Used only so a variant of a reference answer inherits its credit; never for free fuzzy matching.
const pairs: [string, string][] = [
  ['nafas', 'napas'], ['bernafas', 'bernapas'], ['pernafasan', 'pernapasan'],
  ['fikir', 'pikir'], ['berfikir', 'berpikir'], ['fikiran', 'pikiran'],
  ['nasehat', 'nasihat'], ['ijin', 'izin'], ['jaman', 'zaman'], ['rejeki', 'rezeki'],
  ['resiko', 'risiko'], ['sholat', 'salat'], ['shalat', 'salat'], ['ramadhan', 'ramadan'],
  ['propinsi', 'provinsi'], ['apotik', 'apotek'], ['antri', 'antre'], ['ijasah', 'ijazah'],
  ['hutang', 'utang'], ['jadual', 'jadwal'], ['merubah', 'mengubah'], ['silahkan', 'silakan'],
  ['sekedar', 'sekadar'], ['karir', 'karier'], ['kwitansi', 'kuitansi'],
];

const groups = new Map<string, Set<string>>();
for (const [a, b] of pairs) {
  const group = groups.get(a) ?? groups.get(b) ?? new Set<string>();
  group.add(a); group.add(b); groups.set(a, group); groups.set(b, group);
}

export function sameSpelling(a: string, b: string): boolean {
  return a === b || !!groups.get(a)?.has(b);
}

/** The word together with its reviewed spelling variants (nafas → [nafas, napas]). */
export function spellingVariants(word: string): string[] {
  return [...(groups.get(word) ?? [word])];
}

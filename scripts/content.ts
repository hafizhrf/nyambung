import {packVectors} from '../apps/api/src/vector-index.js';
import {compileLexicalBank} from './lexical-bank.js';
import { createHash, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { openDatabase, type Store } from '../apps/api/src/db.js';
import { daily, embeddings, puzzleVersions, randomPool } from '../apps/api/src/schema.js';
import { compileStage, compileRandomSynonym, centerVectors, cosine, fingerprint, FORMULA, type Snapshot } from '../apps/api/src/scoring.js';
import { inspectBridge, bridgeSeparation } from '../apps/api/src/bridge-quality.js';
import { addDays, wibDate } from '../apps/api/src/time.js';
import { reviewedBridges } from '../content/relations.js';
import { selectRounds, combinationKey, type RandomGenerator } from '../apps/api/src/random-generator.js';
import { randomStages } from '../content/random.js';
import { puzzles, introductoryPuzzles, vocabulary, demoVocabulary, aliases, blocked } from '../content/puzzles.js';
try { process.loadEnvFile(resolve('.env')); } catch { /* .env is optional */ }
export function compilePackets(store: Store, start: string, demo = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(start)) || new Date(`${start}T00:00:00Z`).toISOString().slice(0, 10) !== start) throw new Error('Tanggal harus YYYY-MM-DD yang valid.');
  const words = demo ? demoVocabulary : vocabulary;
  const model = demo ? 'curated-demo-v1' : jinaCacheKey();
  let vectors = new Map(store.orm.select().from(embeddings).where(eq(embeddings.model, model)).all().map(row => [row.word, JSON.parse(row.vector) as number[]]));
  if (!demo && words.some(word => !vectors.has(word))) throw new Error('Embedding belum lengkap. Jalankan npm run content -- embed.');
  if (!demo) vectors = centerVectors(vectors, words);
  if (!demo) for (const stage of puzzles.flat().filter(stage => stage.kind !== 'closest')) {
    if (!inspectBridge(stage.clues, stage.best, (a, b) => cosine(vectors.get(a)!, vectors.get(b)!)).accepted) throw new Error(`Clue terlalu berdekatan atau serumpun: ${stage.clues.join(' / ')}.`);
  }
  if (puzzles.length !== 14 || puzzles.some(stages => stages.length !== 5 || stages.some((stage, i) => stage.kind !== (i < 3 ? 'bridge2' : i === 3 ? 'bridge3' : 'closest')))) throw new Error('Konten harus terdiri dari 14 hari dengan urutan lima stage yang sesuai.');
  return (demo ? introductoryPuzzles : puzzles).map((stages, i) => {
    const snapshot: Snapshot = { version: 1, model, formula: demo ? 'curated-demo-v1' : FORMULA, vocabularyHash: fingerprint(words), aliases, blocked, stages: stages.map(stage => compileStage(stage, words, demo ? undefined : vectors)) };
    const date = addDays(start, i);
    return { date, number: Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse('2026-10-22T00:00:00Z')) / 86400000) + 1, demo, snapshot: JSON.stringify(snapshot), publishedAt: new Date().toISOString() };
  });
}
export function publish(store: Store, packets: ReturnType<typeof compilePackets>, upgradeDemo = false) {
  store.orm.transaction(tx => {
    for (const packet of packets) {
      const existing = tx.select().from(daily).where(eq(daily.date, packet.date)).get();
      if (existing) {
        if (upgradeDemo && existing.demo && !packet.demo) {
          const id = fingerprint(JSON.parse(existing.snapshot));
          // Run versions already pin their own snapshot; keep this old edition too.
          tx.insert(puzzleVersions).values({ id, snapshot: existing.snapshot, demo: true }).onConflictDoNothing().run();
          tx.update(daily).set(packet).where(eq(daily.date, packet.date)).run();
        } else if (existing.snapshot !== packet.snapshot || existing.demo !== packet.demo) throw new Error(`${packet.date} sudah diterbitkan. Snapshot tidak boleh diubah; gunakan database demo terpisah atau tanggal lain.`);
      } else tx.insert(daily).values(packet).run();
    }
  }, { behavior: 'immediate' });
}
// Explicit editorial revision for dates that nobody has started. The current
// day's shared puzzle and every run's pinned snapshot are never changed.
export function refreshUpcoming(store: Store, packets: ReturnType<typeof compilePackets>, today = wibDate()) {
  const upcoming = packets.filter(packet => packet.date > today);
  store.sqlite.transaction(() => {
    for (const packet of upcoming) {
      if (store.sqlite.prepare("SELECT 1 FROM runs WHERE mode='daily' AND date=? LIMIT 1").get(packet.date)) throw new Error(`${packet.date} sudah memiliki sesi. Revisi dibatalkan.`);
    }
    const update = store.sqlite.prepare('INSERT INTO daily(date,number,demo,snapshot,published_at) VALUES (?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET number=excluded.number,demo=excluded.demo,snapshot=excluded.snapshot,published_at=excluded.published_at');
    for (const packet of upcoming) update.run(packet.date, packet.number, Number(packet.demo), packet.snapshot, packet.publishedAt);
  }).immediate();
  return upcoming.length;
}
export function compileRandomPool(store: Store, demo = false, generated = !demo): Snapshot {
  if (randomStages.some(stage => puzzles.flat().some(dailyStage => dailyStage.kind === stage.kind && [...dailyStage.clues].sort().join(',') === [...stage.clues].sort().join(',')))) throw new Error('Bank acak tidak boleh memakai petunjuk daily terjadwal.');
  const words = demo ? [...new Set([...demoVocabulary, ...randomStages.flatMap(stage => [...stage.clues, stage.best, ...Object.keys(stage.overrides), ...stage.excluded || []])])] : vocabulary;
  const model = demo ? 'curated-demo-v1' : jinaCacheKey();
  let vectors = new Map(store.orm.select().from(embeddings).where(eq(embeddings.model, model)).all().map(row => [row.word, JSON.parse(row.vector) as number[]]));
  if (!demo && words.some(word => !vectors.has(word))) throw new Error('Embedding belum lengkap. Bank acak tidak diterbitkan.');
  if (!demo) vectors = centerVectors(vectors, words);
  let generator:RandomGenerator | undefined;
  let stages:(typeof randomStages[number] & {concept?:string})[]=randomStages;
  if (generated && !demo) {
    generator={version:4,bridgePolicy:'cross-context-v1',packed:packVectors(words,vectors),words,answers:[],relations:reviewedBridges,profiles:[],excludedCombos:[...puzzles.flat(),...randomStages].map(stage=>combinationKey(stage.clues))};
    const lexical=compileLexicalBank(generator);
    generator.relations=[...reviewedBridges,...lexical.relations];
    generator.answers=generator.relations.map(relation=>relation.answer);
    const human=randomStages.filter(stage=>stage.kind==='closest').map(stage=>({...stage,concept:lexical.synonyms.find(other=>other.clues[0]===stage.clues[0])?.concept}));
    const known=new Set(human.map(stage=>stage.clues[0]));
    stages=[...human,...lexical.synonyms.filter(stage=>!known.has(stage.clues[0]))];
    const required=generator.relations.flatMap(relation=>[relation.answer,...relation.facets.flat()]);
    const wordSet=new Set(words);
    if(required.some(word=>!wordSet.has(word)||blocked.includes(word))) throw Error('Bank leksikal mengandung kata yang belum tersedia.');
    if(generator.relations.length<3||stages.length<100) throw Error('Bank leksikal belum cukup untuk publikasi.');
  }
  return {version:1,model,formula:generator?'packed-wordnet-ridge-harmonic-v4':demo?'curated-demo-v1':FORMULA,vocabularyHash:fingerprint(words),aliases,blocked,...(generator?{generator}:{}),stages:stages.map(stage=>generator?{...stage,scores:{},vocabularySize:words.length-stage.clues.length}:compileStage(stage,words,demo?undefined:vectors))};
}

export function publishRandomPool(store: Store, snapshot: Snapshot, demo = false) {
  for (const [kind, minimum] of [['bridge2',3], ['bridge3',1], ['closest',1]] as const) if ((!snapshot.generator || kind === 'closest') && snapshot.stages.filter(stage => stage.kind === kind).length < minimum) throw new Error('Bank acak belum lengkap.');
  const value = JSON.stringify(snapshot);
  const versionId = createHash('sha256').update(value).digest('hex');
  store.orm.transaction(tx => {
    tx.insert(puzzleVersions).values({ id:versionId, snapshot:value, demo }).onConflictDoNothing().run();
    tx.insert(randomPool).values({ id:'active', versionId }).onConflictDoUpdate({ target:randomPool.id, set:{ versionId } }).run();
  }, { behavior:'immediate' });
}
export function requalifyPublishedRandomPool(store: Store): Snapshot {
  const row = store.sqlite.prepare("SELECT v.snapshot FROM random_pool p JOIN puzzle_versions v ON v.id=p.version_id WHERE p.id='active'").get() as {snapshot:string}|undefined;
  if (!row) throw new Error('Bank acak belum tersedia.');
  const snapshot = JSON.parse(row.snapshot) as Snapshot;
  if (!snapshot.generator || snapshot.generator.version < 3) throw new Error('Bank ini belum memakai retrieval. Siapkan bank baru terlebih dahulu.');
  snapshot.generator.bridgePolicy = 'cross-context-v1';
  const {synonyms}=compileLexicalBank(snapshot.generator);
  const human=randomStages.filter(stage=>stage.kind==='closest').map(stage=>({...stage,concept:synonyms.find(other=>other.clues[0]===stage.clues[0])?.concept}));
  const known=new Set(human.map(stage=>stage.clues[0]));
  snapshot.stages=[...human,...synonyms.filter(stage=>!known.has(stage.clues[0]))].map(stage=>({...stage,scores:{},vocabularySize:snapshot.generator!.words.length-1}));

  snapshot.generator.excludedCombos = [...new Set([...snapshot.generator.excludedCombos, ...puzzles.flat().map(stage => combinationKey(stage.clues))])];
  if (!snapshot.formula.includes('/cross-context-v1')) snapshot.formula += '/cross-context-v1';
  if (!snapshot.formula.includes('/reviewed-meanings-v1')) snapshot.formula += '/reviewed-meanings-v1';
  return snapshot;
}
export function retireUnstartedTrivialRuns(store: Store, timestamp = new Date().toISOString()) {
  const rows = store.sqlite.prepare("SELECT id,version_id,stage_order FROM runs r WHERE mode='random' AND completed_at IS NULL AND superseded_at IS NULL AND NOT EXISTS(SELECT 1 FROM answers a WHERE a.run_id=r.id)").all() as {id:string;version_id:string;stage_order:string|null}[];
  const generators = new Map<string, RandomGenerator>();
  const retire: string[] = [];
  for (const row of rows) {
    const order = row.stage_order ? JSON.parse(row.stage_order) : null;
    if (!order || Array.isArray(order) || !Array.isArray(order.rounds)) continue;
    let generator = generators.get(row.version_id);
    if (!generator) {
      const version = store.sqlite.prepare('SELECT snapshot FROM puzzle_versions WHERE id=?').get(row.version_id) as {snapshot:string};
      generator = (JSON.parse(version.snapshot) as Snapshot).generator;
      if (!generator) continue;
      generators.set(row.version_id, generator);
    }
    if (order.rounds.some((round: import('../apps/api/src/random-generator.js').GeneratedRound) => !bridgeSeparation(generator!, round.clues, round.target ?? '').accepted)) retire.push(row.id);
  }
  return store.sqlite.transaction(() => {
    let count = 0;
    for (const id of retire) count += store.sqlite.prepare('UPDATE runs SET superseded_at=? WHERE id=? AND completed_at IS NULL AND superseded_at IS NULL AND NOT EXISTS(SELECT 1 FROM answers WHERE run_id=?)').run(timestamp, id, id).changes;
    return count;
  }).immediate();
}
export function jinaCacheKey() {
  return `jina/${process.env.JINA_EMBEDDING_MODEL || 'jina-embeddings-v5-text-small'}/text-matching/512/id-context-v2`;
}
export async function embed(store: Store, words = vocabulary, concurrency = 4) {
  const key = process.env.JINA_API_KEY;
  if (!key) throw new Error('Set JINA_API_KEY di .env untuk menyiapkan embedding.');
  const model = process.env.JINA_EMBEDDING_MODEL || 'jina-embeddings-v5-text-small';
  const cacheModel = jinaCacheKey();
  const existing = new Set(store.orm.select({ word: embeddings.word }).from(embeddings).where(eq(embeddings.model, cacheModel)).all().map(row => row.word));
  const missing = words.filter(word => !existing.has(word));
  const batchSize = 128;
  let cursor = 0, done = 0, failure: unknown;
  async function worker() {
    while (cursor < missing.length && !failure) {
      const i = cursor; cursor += batchSize;
      const batch = missing.slice(i, i + batchSize);
      let response: Response | undefined;
      for (let attempt = 0; attempt < 6; attempt++) {
        response = await fetch('https://api.jina.ai/v1/embeddings', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, task: 'text-matching', dimensions: 512, normalized: true, embedding_type: 'float', input: batch.map(word => `Kata bahasa Indonesia: ${word}`) }),
          signal: AbortSignal.timeout(60000),
        });
        if (![429, 500, 502, 503].includes(response.status)) break;
        if (attempt < 5) {
          const retry = Number(response.headers.get('retry-after'));
          await new Promise(r => setTimeout(r, Math.min(30000, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 2000 * 2 ** attempt)));
        }
      }
      if (!response?.ok) throw new Error(`Jina gagal (HTTP ${response?.status}). Batch lengkap tetap tersimpan. Periksa key, saldo token, atau kuota lalu jalankan embed lagi.`);
      const body = await response.json() as { data?: { index: number; embedding: number[] }[] };
      if (body.data?.length !== batch.length) throw new Error('Respons batch tidak lengkap; batch tidak disimpan.');
      const ordered = [...body.data].sort((a, b) => a.index - b.index);
      if (ordered.some((item, index) => item.index !== index)) throw new Error('Urutan batch tidak valid; batch tidak disimpan.');
      const vectors = ordered.map(item => item.embedding);
      if (vectors.some(vector => !Array.isArray(vector) || vector.length !== 512 || vector.some(v => !Number.isFinite(v)) || !vector.some(v => v !== 0))) throw new Error('Vektor tidak valid; batch tidak disimpan.');
      store.orm.transaction(tx => batch.forEach((word, n) => tx.insert(embeddings).values({ word, model: cacheModel, vector: JSON.stringify(vectors[n]) }).onConflictDoNothing().run()));
      done += batch.length;
      if (done % 1024 === 0 || done === missing.length) console.log(`Embedding Jina tersimpan: ${done}/${missing.length} kata baru.`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.ceil(missing.length / batchSize)) }, () => worker().catch(error => { failure = error; })));
  if (failure) throw failure;
  console.log(`Embedding ${model} lengkap. Lanjutkan preview.`);
}
export function approvalHash(packets: ReturnType<typeof compilePackets>) {
  const hash = createHash('sha256');
  for (const packet of packets) hash.update(packet.date).update('\n').update(packet.snapshot).update('\n');
  return hash.digest('hex');
}
async function main() {
  const command = process.argv[2];
  const store = openDatabase();
  try {
    if (command === 'embed') return await embed(store);
    if (command === 'preview-random' || command === 'publish-random') {
      const snapshot = process.argv.includes('--reuse-published') ? requalifyPublishedRandomPool(store) : compileRandomPool(store);
      const hash = fingerprint(snapshot);
      if (command === 'preview-random') {
        mkdirSync('data', { recursive:true });
        writeFileSync('data/random-review.json', JSON.stringify({ approvalHash:hash, ...(snapshot.generator ? { generator:{ answers:snapshot.generator.relations?.length, closest:snapshot.stages.length, packedBytes:snapshot.generator.packed ? Buffer.byteLength(snapshot.generator.packed.data,'base64') : undefined, profiles:new Set(snapshot.generator.relations?.flatMap(row=>row.facets.flat())??snapshot.generator.profiles.map(profile=>profile.word)).size, vocabulary:snapshot.generator.words.length, sample:selectRounds(snapshot.generator, randomInt).stages.map(stage=>({ clues:stage.clues,best:stage.best,top:Object.entries(stage.scores).sort((a,b)=>b[1].score-a[1].score).slice(0,8) })) } } : {}), closestCount:snapshot.stages.length, stages:snapshot.stages.slice(0,25).map(stage => ({ ...stage, scores:Object.entries(stage.scores).sort((a,b) => b[1].score - a[1].score).slice(0,15) })) }, null, 2));
        console.log(`Review data/random-review.json, lalu npm run content -- publish-random${process.argv.includes('--reuse-published') ? ' --reuse-published' : ''} --approve ${hash}`);
      } else {
        if (process.argv[process.argv.indexOf('--approve') + 1] !== hash) throw new Error('Hash review bank acak tidak sesuai.');
        publishRandomPool(store, snapshot);
        if (snapshot.generator?.bridgePolicy) console.log(`${retireUnstartedTrivialRuns(store)} sesi acak bermasalah tanpa tebakan dipensiunkan; sesi yang sudah dijawab tetap.`);
        console.log(snapshot.generator ? `Generator acak aktif: ${new Set(snapshot.generator.relations?.flatMap(row=>row.facets.flat())??snapshot.generator.profiles.map(profile=>profile.word)).size} kata petunjuk, ${snapshot.generator.words.length} kandidat jawaban.` : `${snapshot.stages.length} soal acak semantik diterbitkan.`);
      }
      return;
    }
    if (!['demo', 'preview', 'publish', 'upgrade-demo', 'refresh-upcoming'].includes(command)) throw new Error('Pakai: npm run content -- embed | preview | publish --approve HASH | refresh-upcoming --approve HASH | upgrade-demo --approve HASH | demo');
    const startIndex = process.argv.indexOf('--start');
    const start = startIndex >= 0 ? process.argv[startIndex + 1] : process.env.CONTENT_START_DATE || wibDate();
    const packets = compilePackets(store, start, command === 'demo');
    const hash = approvalHash(packets);
    if (command === 'preview') {
      const review = packets.map(p => {
        const { stages, ...metadata } = JSON.parse(p.snapshot) as Snapshot;
        return { date: p.date, ...metadata, stages: stages.map(stage => {
          const entries = Object.entries(stage.scores).sort((a, b) => b[1].score - a[1].score);
          const buckets = Array(11).fill(0);
          for (const [, entry] of entries) buckets[Math.floor(entry.score / 100)]++;
          return { ...stage, scores: entries.slice(0, 30), uniqueScores: new Set(entries.map(([, value]) => value.score)).size, buckets, samples: Object.fromEntries(['warung', 'kantin', 'kuliner', 'nongkrong', 'belanja', 'pasar', 'toko', 'batu', 'kursi', 'ayam', 'pisang', 'sepeda'].filter(word => stage.scores[word]).map(word => [word, stage.scores[word]])) };
        }) };
      });
      mkdirSync('data', { recursive: true }); writeFileSync('data/review.json', JSON.stringify({ approvalHash: hash, vocabularyCount: vocabulary.length, packets: review }, null, 2));
      console.log(`Review kandidat di data/review.json. Periksa asosiasi, slang, dan antonim pada semua 70 stage.\nSetelah review: npm run content -- publish --start ${start} --approve ${hash}`);
    } else {
      if (command !== 'demo' && process.argv[process.argv.indexOf('--approve') + 1] !== hash) throw new Error('Publikasi membutuhkan hash preview yang sudah direview. Jalankan preview ulang setelah perubahan konten.');
      if (command === 'refresh-upcoming') console.log(`${refreshUpcoming(store, packets)} daily mendatang diperbarui; daily hari ini dan sesi lama tetap.`);
      else { publish(store, packets, command === 'upgrade-demo'); console.log(`${packets.length} paket ${command === 'demo' ? 'DEMO KURASI (bukan skor embedding)' : 'semantik'} tersedia mulai ${start}.`); }
    }
  } finally { store.sqlite.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });

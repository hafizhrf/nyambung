import {isReviewedClosest} from '../../../content/closest.js';
import {sameWordFamily} from './word-family.js';
import {evaluateClosest} from './vector-index.js';
import { trainDifficulty, type Observation } from './adaptive.js';
import { roundFeatures, type Exposure } from './retrieval.js';
import { and, eq, asc, desc, isNull, lt } from 'drizzle-orm';
import { randomUUID, randomInt } from 'node:crypto';
import { normalizeWord, type RunView, type StageResult, type Stats, type DailyComparison, type ArchiveView } from '@nyambung/shared';
import { answers, daily, players, runs, puzzleVersions, randomPool } from './schema.js';
import type { Store } from './db.js';
import { createHash } from 'node:crypto';
import { evaluateRound, selectRounds, combinationKey, type GeneratedSelection, type GeneratedRound } from './random-generator.js';
import type { Snapshot, PublishedStage } from './scoring.js';
import { addDays, isPuzzleDate, wibDate } from './time.js';
export class GameError extends Error { constructor(message: string, public status: 400 | 404 | 409 = 400) { super(message); } }
export function game(store: Store, clock: () => Date = () => new Date()) {
  const db = store.orm;
  const snapshotCache = new Map<string, Snapshot>();
  const generatedCache = new Map<string, PublishedStage>();
  const roundKey = (versionId:string, round:GeneratedRound) => `${versionId}/${JSON.stringify(round)}`;
  function cacheRound(versionId:string, round:GeneratedRound, stage:PublishedStage) {
    if (generatedCache.size >= 8) generatedCache.delete(generatedCache.keys().next().value!);
    generatedCache.set(roundKey(versionId,round),stage);
  }
  function stageFor(run:{versionId:string|null;stageOrder:string|null}, index:number):PublishedStage {
    const snapshot=snapshotFor(run.versionId!);
    const order=run.stageOrder ? JSON.parse(run.stageOrder) as number[] | GeneratedSelection : null;
    if (order && !Array.isArray(order) && order.generator === 1) {
      if (index === 4) {
        const descriptor=snapshot.stages[order.closestIndex ?? 0];
        if(snapshot.generator?.version!==4) return descriptor;
        const round:GeneratedRound={kind:'closest',clues:descriptor.clues,target:descriptor.best};
        const key=roundKey(run.versionId!,round);let stage=generatedCache.get(key);
        if(!stage) {stage=evaluateClosest(snapshot.generator,descriptor);cacheRound(run.versionId!,round,stage);}
        return stage;
      }
      const round=order.rounds[index]; const key=roundKey(run.versionId!,round);
      let stage=generatedCache.get(key);
      if (!stage) {
        if (!snapshot.generator || ![1,2,3,4].includes(snapshot.generator.version)) throw new Error('Versi generator tidak didukung.');
        stage=evaluateRound(snapshot.generator,round) ?? undefined;
        if (!stage) throw new Error('Kombinasi tersimpan tidak valid.');
        cacheRound(run.versionId!,round,stage);
      }
      return stage;
    }
    return snapshot.stages[Array.isArray(order) ? order[index] : index];
  }
  function snapshotFor(versionId: string): Snapshot {
    let snapshot = snapshotCache.get(versionId);
    if (!snapshot) {
      const version = db.select().from(puzzleVersions).where(eq(puzzleVersions.id, versionId)).get();
      if (!version) throw new Error('Versi puzzle tidak ditemukan.');
      snapshot = JSON.parse(version.snapshot) as Snapshot;
      if (snapshotCache.size >= 2) snapshotCache.delete(snapshotCache.keys().next().value!);
      snapshotCache.set(versionId, snapshot);
    }
    return snapshot;
  }
  function requireRun(id: string, playerId: string) {
    const run = db.select().from(runs).where(and(eq(runs.id, id), eq(runs.playerId, playerId))).get();
    if (!run) throw new GameError('Permainan tidak ditemukan.', 404);
    return run;
  }
  function view(id: string, playerId: string): RunView {
    const run = requireRun(id, playerId);
    const puzzle = run.mode === 'daily' ? db.select({ number: daily.number }).from(daily).where(eq(daily.date, run.date)).get() : null;
    const version = db.select({ demo: puzzleVersions.demo }).from(puzzleVersions).where(eq(puzzleVersions.id, run.versionId!)).get()!;
    const results = db.select().from(answers).where(eq(answers.runId, id)).orderBy(asc(answers.stage)).all().map(a => JSON.parse(a.result) as StageResult);
    const index = results.length;
    const stage = index < 5 ? stageFor(run,index) : null;
    return { mode: run.mode, id, date: run.date, number: puzzle?.number ?? 0, demo: version.demo, completed: index === 5, total: results.reduce((sum, r) => sum + r.score, 0), results, current: stage ? { index, kind: stage.kind, clues: stage.clues } : null };
  }
  function archive(playerId: string, before?: string): ArchiveView {
    const today = wibDate(clock());
    if (before !== undefined && !isPuzzleDate(before)) throw new GameError('Tanggal tidak valid.');
    const cutoff = before && before < today ? before : today;
    const rows = db.select({ date:daily.date, number:daily.number, demo:daily.demo, runId:runs.id, completedAt:runs.completedAt, runDemo:puzzleVersions.demo })
      .from(daily)
      .leftJoin(runs, and(eq(runs.date,daily.date), eq(runs.playerId,playerId), eq(runs.mode,'daily'), isNull(runs.supersededAt)))
      .leftJoin(puzzleVersions, eq(puzzleVersions.id,runs.versionId))
      .where(lt(daily.date,cutoff)).orderBy(desc(daily.date)).limit(51).all();
    return {
      today,
      entries:rows.slice(0,50).map(row => ({ date:row.date, number:row.number, demo:row.demo,
        status:!row.runId || row.runDemo !== row.demo ? 'new' : row.completedAt ? 'completed' : 'in_progress' })),
      nextBefore:rows.length > 50 ? rows[49].date : null,
    };
  }
  function start(playerId: string, date = wibDate(clock())) {
    if (!isPuzzleDate(date)) throw new GameError('Tanggal tidak valid.');
    if (date > wibDate(clock())) throw new GameError('Daily tanggal ini belum tersedia.', 404);
    return db.transaction(tx => {
      const puzzle = tx.select().from(daily).where(eq(daily.date, date)).get();
      if (!puzzle) throw new GameError(date === wibDate(clock()) ? 'Puzzle hari ini belum tersedia.' : 'Daily tanggal ini tidak tersedia.', 404);
      let run = tx.select().from(runs).where(and(eq(runs.playerId, playerId), eq(runs.date, date), eq(runs.mode, 'daily'), isNull(runs.supersededAt))).get();
      if (run && !puzzle.demo) {
        const previous = tx.select({ demo: puzzleVersions.demo }).from(puzzleVersions).where(eq(puzzleVersions.id, run.versionId!)).get();
        if (previous?.demo) {
          tx.update(runs).set({ supersededAt: clock().toISOString() }).where(eq(runs.id, run.id)).run();
          run = undefined;
        }
      }
      if (!run) {
        const versionId = createHash('sha256').update(puzzle.snapshot).digest('hex');
        tx.insert(puzzleVersions).values({ id: versionId, snapshot: puzzle.snapshot, demo: puzzle.demo }).onConflictDoNothing().run();
        run = { id: randomUUID(), playerId, date, completedAt: null, versionId, supersededAt: null, mode: 'daily' as const, stageOrder: null };
        tx.insert(runs).values(run).run();
      }
      return view(run.id, playerId);
    }, { behavior: 'immediate' });
  }
  function submit(id: string, playerId: string, input: { stage: number; word?: string; skip?: boolean }) {
    return db.transaction(tx => {
      const run = requireRun(id, playerId);
      // A repeated request always returns the original committed result, including across tabs.
      if (tx.select().from(answers).where(and(eq(answers.runId, id), eq(answers.stage, input.stage))).get()) return view(id, playerId);
      const count = tx.select().from(answers).where(eq(answers.runId, id)).all().length;
      if (input.stage !== count || count >= 5) throw new GameError('Stage sudah berubah. Muat ulang progresmu.', 409);
      const snapshot = snapshotFor(run.versionId!);
      const stage = stageFor(run,count);
      let details: { similarities?: number[]; rank?: number; vocabularySize?: number } = {};
      let word: string | null = null;
      let score = 0; let connections = stage.clues.map(() => 0);
      if (!input.skip) {
        const typed = normalizeWord(input.word || '');
        word = Object.hasOwn(snapshot.aliases, typed) ? snapshot.aliases[typed] : typed;
        if (!/^[a-z]+$/.test(typed) || snapshot.blocked.includes(word)) throw new GameError('Pakai satu kata Indonesia yang sesuai, ya.');
        if (stage.clues.includes(word)) throw new GameError('Cari kata lain selain petunjuknya, ya.');
        const entry = Object.hasOwn(stage.scores, word) ? stage.scores[word] : undefined;
        if (!entry) throw new GameError('Kata ini belum ada di kamus Nyambung. Coba kata lain; kesempatanmu masih utuh.');
        score = entry.score; connections = entry.connections; details = { similarities: entry.similarities, rank: entry.rank, vocabularySize: entry.vocabularySize ?? stage.vocabularySize ?? Object.keys(stage.scores).length };
      }
      const result: StageResult = { index: count, kind: stage.kind, clues: stage.clues, word, score, connections, best: stage.best, explanation: stage.explanation, skipped: !!input.skip, ...details };
      tx.insert(answers).values({ runId: id, stage: count, result: JSON.stringify(result) }).run();
      if (count === 4) tx.update(runs).set({ completedAt: clock().toISOString() }).where(eq(runs.id, id)).run();
      return view(id, playerId);
    }, { behavior: 'immediate' });
  }
  function stats(playerId: string): Stats {
    const finished = db.select().from(runs).where(and(eq(runs.playerId, playerId), eq(runs.mode, 'daily'), isNull(runs.supersededAt))).orderBy(desc(runs.date)).all().filter(r => r.completedAt);
    const totals = finished.map(r => view(r.id, playerId).total);
    let streak = 0, expected = wibDate(clock());
    if (finished[0]?.date !== expected) expected = addDays(expected, -1);
    for (const run of finished) { if (run.date !== expected) break; streak++; expected = addDays(expected, -1); }
    return { completed: finished.length, streak, best: Math.max(0, ...totals), average: totals.length ? Math.round(totals.reduce((a, b) => a + b) / totals.length) : 0 };
  }
  function randomStatus(playerId: string) {
    const pool = db.select().from(randomPool).where(eq(randomPool.id, 'active')).get();
    const active = db.select().from(runs).where(and(eq(runs.playerId, playerId), eq(runs.mode, 'random'), isNull(runs.completedAt), isNull(runs.supersededAt))).get();
    return { available: !!pool, run: active ? view(active.id, playerId) : null };
  }
  function pickClosest(snapshot:Snapshot, playerId:string):number {
    const candidates=snapshot.stages.map((stage,index)=>({stage,index})).filter(item=>item.stage.kind==='closest'&&isReviewedClosest(item.stage.clues[0],item.stage.best)&&!sameWordFamily(item.stage.clues[0],item.stage.best));
    if (!candidates.length) throw new Error('Babak kedekatan makna belum tersedia.');
    // Read actual clues rather than stage indices: indices change between editions.
    // Keeping the N-1 most recent distinct clues gives a full rotation of N clues.
    const available=new Set(candidates.map(item=>combinationKey(item.stage.clues)));
    const history=store.sqlite.prepare("SELECT a.result FROM answers a JOIN runs r ON r.id=a.run_id WHERE r.player_id=? AND r.mode='random' AND a.stage=4 ORDER BY r.rowid DESC").iterate(playerId) as Iterable<{result:string}>;
    const recent=new Set<string>(),recentConcepts=new Set<string>();
    const concepts=new Map(candidates.map(item=>[combinationKey(item.stage.clues),item.stage.concept??combinationKey(item.stage.clues)]));
    for(const row of history) {
      if(recent.size>=available.size-1) break;
      const key=combinationKey((JSON.parse(row.result) as StageResult).clues);
      if(available.has(key)) recent.add(key);
      if(recentConcepts.size<20 && concepts.has(key)) recentConcepts.add(concepts.get(key)!);
    }
    const fresh=candidates.filter(item=>!recent.has(combinationKey(item.stage.clues)));
    const diverse=fresh.filter(item=>!recentConcepts.has(item.stage.concept??combinationKey(item.stage.clues)));
    const choices=diverse.length?diverse:fresh;
    return choices[randomInt(choices.length)].index;
  }
  function startRandom(playerId: string) {
    return db.transaction(tx => {
      const active = randomStatus(playerId).run;
      if (active) return active;
      const pool = tx.select().from(randomPool).where(eq(randomPool.id, 'active')).get();
      if (!pool) throw new GameError('Soal acak belum tersedia.', 404);
      const snapshot = snapshotFor(pool.versionId);
      if (snapshot.generator) {
        const history=store.sqlite.prepare("SELECT stage_order FROM runs WHERE player_id = ? AND mode = 'random' ORDER BY rowid DESC LIMIT 20").all(playerId) as {stage_order:string|null}[];
        const excluded = new Set<string>();
        for (const entry of history) {
          const order=entry.stage_order ? JSON.parse(entry.stage_order) as number[] | GeneratedSelection : null;
          if (order && !Array.isArray(order) && order.generator === 1) order.rounds.forEach(round=>excluded.add(combinationKey(round.clues)));
        }
        let context:import('./retrieval.js').RetrievalContext|undefined;
        if(snapshot.generator.version>=3) {
          const generator=snapshot.generator;
          const own=store.sqlite.prepare("SELECT a.result FROM answers a JOIN runs r ON r.id=a.run_id WHERE r.player_id=? AND r.mode='random' AND a.stage<4 ORDER BY r.rowid DESC,a.stage DESC LIMIT 1200").all(playerId) as {result:string}[];
          const others=store.sqlite.prepare("SELECT a.result FROM answers a JOIN runs r ON r.id=a.run_id WHERE r.player_id<>? AND r.mode='random' AND a.stage<4 ORDER BY r.rowid DESC,a.stage DESC LIMIT 800").all(playerId) as {result:string}[];
          const exposures:Exposure[]=[],observations:Observation[]=[];
          for(const [rows,weight] of [[own,3],[others,1]] as const) for(const row of rows) {
            const result=JSON.parse(row.result) as StageResult;
            if(weight===3) exposures.push({best:result.best,clues:result.clues});
            const features=roundFeatures(generator,{kind:result.kind,clues:result.clues},result.best);
            if(features) observations.push({features,outcome:result.skipped?0:result.score/1000,weight});
          }
          context={exposures,model:trainDifficulty(observations)};
        }
        const {selection,stages}=selectRounds(snapshot.generator,randomInt,excluded,context);
        selection.closestIndex=pickClosest(snapshot,playerId);
        stages.forEach((stage,index)=>cacheRound(pool.versionId,selection.rounds[index],stage));
        const id=randomUUID();
        tx.insert(runs).values({id,playerId,date:wibDate(clock()),mode:'random',versionId:pool.versionId,stageOrder:JSON.stringify(selection)}).run();
        return view(id,playerId);
      }
      const pick = (kind: 'bridge2' | 'bridge3' | 'closest', count: number) => {
        const candidates = snapshot.stages.map((stage, index) => ({ stage, index })).filter(item => item.stage.kind === kind).map(item => item.index);
        if (candidates.length < count) throw new Error('Bank soal acak belum lengkap.');
        const chosen: number[] = [];
        while (chosen.length < count) chosen.push(candidates.splice(randomInt(candidates.length), 1)[0]);
        return chosen;
      };
      const order = [...pick('bridge2', 3), ...pick('bridge3', 1), pickClosest(snapshot,playerId)];
      const id = randomUUID();
      tx.insert(runs).values({ id, playerId, date:wibDate(clock()), mode:'random', versionId:pool.versionId, stageOrder:JSON.stringify(order) }).run();
      return view(id, playerId);
    }, { behavior: 'immediate' });
  }
  function comparison(id: string, playerId: string): DailyComparison {
    const run = requireRun(id, playerId);
    if (run.mode !== 'daily') throw new GameError('Perbandingan hanya tersedia untuk daily.');
    const version = db.select({ demo:puzzleVersions.demo }).from(puzzleVersions).where(eq(puzzleVersions.id, run.versionId!)).get()!;
    if (version.demo) return { players:0, average:0, best:0, rank:null, abovePercent:null, histogram:Array(10).fill(0), ownScore:null };
    // One completed, active run per anonymous identity, on this exact frozen edition.
    const cohort = store.sqlite.prepare(`SELECT r.id, SUM(CAST(json_extract(a.result, '$.score') AS INTEGER)) AS total
      FROM runs r JOIN answers a ON a.run_id = r.id
      WHERE r.mode = 'daily' AND r.date = ? AND r.version_id = ? AND r.completed_at IS NOT NULL AND r.superseded_at IS NULL
      GROUP BY r.id HAVING COUNT(*) = 5`).all(run.date, run.versionId) as { id:string; total:number }[];
    const own = cohort.find(item => item.id === id);
    return {
      histogram:Array.from({length:10}, (_,i) => cohort.filter(item => Math.min(9,Math.floor(item.total/500)) === i).length),
      ownScore:own?.total ?? null,
      players:cohort.length,
      average:cohort.length ? Math.round(cohort.reduce((sum, item) => sum + item.total, 0) / cohort.length) : 0,
      best:Math.max(0, ...cohort.map(item => item.total)),
      rank:own ? 1 + cohort.filter(item => item.total > own.total).length : null,
      abovePercent:own && cohort.length > 1 ? Math.round(100 * cohort.filter(item => item.total < own.total).length / (cohort.length - 1)) : null,
    };
  }
  function createPlayer(id = randomUUID()) { db.insert(players).values({ id, createdAt: clock().toISOString() }).onConflictDoNothing().run(); return id; }
  return { view, start, archive, startRandom, randomStatus, comparison, submit, stats, createPlayer };
}

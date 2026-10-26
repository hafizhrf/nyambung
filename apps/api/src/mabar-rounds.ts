import { randomInt } from "node:crypto";
import { normalizeWord, type StageKind } from "@nyambung/shared";
import { isReviewedClosest } from "../../../content/closest.js";
import { sameWordFamily } from "./word-family.js";
import { evaluateClosest } from "./vector-index.js";
import {
  evaluateRound,
  selectRounds,
  combinationKey,
  type GeneratedRound,
  type RandomGenerator,
} from "./random-generator.js";
import { retrieveCandidates } from "./retrieval.js";
import { trainDifficulty } from "./adaptive.js";
import type { Store } from "./db.js";
import type { PublishedStage, ScoreEntry, Snapshot } from "./scoring.js";

/**
 * A round of Tebak Cepat, stored by reference. Scores cover the whole
 * vocabulary, so they are evaluated on demand and never kept in room state.
 */
export interface RoundRef {
  version: string;
  kind: StageKind;
  clues: string[];
  index?: number;
  round?: GeneratedRound;
}
export class RoundError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const shuffled = <T>(items: T[]) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
/** Mixes two-clue, three-clue and closest-meaning rounds like Mode Acak. */
export function planKinds(count: number): StageKind[] {
  const base: StageKind[] = ["bridge2", "closest", "bridge3"];
  const weighted: StageKind[] = ["bridge2", "bridge2", "closest", "bridge3", "closest"];
  const kinds = base.slice(0, count);
  while (kinds.length < count) kinds.push(weighted[randomInt(weighted.length)]);
  return shuffled(kinds);
}
export function createRoundSource(store: Store) {
  const snapshots = new Map<string, Snapshot>();
  const stages = new Map<string, PublishedStage>();
  function snapshot(version: string) {
    let value = snapshots.get(version);
    if (!value) {
      const row = store.sqlite
        .prepare("SELECT snapshot FROM puzzle_versions WHERE id=?")
        .get(version) as { snapshot: string } | undefined;
      if (!row) throw new RoundError("Paket soal acak tidak ditemukan.", 409);
      value = JSON.parse(row.snapshot) as Snapshot;
      if (snapshots.size >= 2)
        snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(version, value);
    }
    return value;
  }
  function pick(count: number): RoundRef[] {
    const pool = store.sqlite
      .prepare("SELECT version_id AS version FROM random_pool WHERE id='active'")
      .get() as { version: string } | undefined;
    if (!pool) throw new RoundError("Soal acak belum tersedia.", 409);
    const version = pool.version,
      data = snapshot(version),
      kinds = planKinds(count),
      want = (kind: StageKind) => kinds.filter((k) => k === kind).length;
    const closest = shuffled(
      data.stages
        .map((stage, index) => ({ stage, index }))
        .filter(
          ({ stage }) =>
            stage.kind === "closest" &&
            isReviewedClosest(stage.clues[0], stage.best) &&
            !sameWordFamily(stage.clues[0], stage.best),
        ),
    );
    if (want("closest") && !closest.length)
      throw new RoundError("Babak dekat makna belum tersedia.", 409);
    const byKind: Record<StageKind, RoundRef[]> = {
      closest: closest.map(({ stage, index }) => ({
        version,
        kind: "closest",
        clues: stage.clues,
        index,
      })),
      bridge2: [],
      bridge3: [],
    };
    if (data.generator?.relations?.length && data.generator.version >= 3) {
      const taken = { answers: new Set<string>(), clues: new Set<string>() };
      for (const kind of ["bridge2", "bridge3"] as const)
        byKind[kind] = retrieved(data.generator, kind, want(kind), taken).map(
          (round) => ({ version, kind, clues: round.clues, round }),
        );
    } else if (data.generator) {
      // Older generators: each pass yields three two-clue rounds and one three-clue round.
      const excluded = new Set<string>();
      for (
        let pass = 0;
        pass < 12 &&
        (byKind.bridge2.length < want("bridge2") ||
          byKind.bridge3.length < want("bridge3"));
        pass++
      ) {
        const { selection, stages: evaluated } = selectRounds(
          data.generator,
          randomInt,
          excluded,
        );
        selection.rounds.forEach((round, n) => {
          excluded.add(combinationKey(round.clues));
          if (round.kind === "closest") return;
          const ref = { version, kind: round.kind, clues: round.clues, round };
          byKind[round.kind].push(ref);
          remember(ref, evaluated[n]);
        });
      }
    } else
      for (const kind of ["bridge2", "bridge3"] as const)
        byKind[kind] = shuffled(
          data.stages
            .map((stage, index) => ({ stage, index }))
            .filter(({ stage }) => stage.kind === kind)
            .map(({ stage, index }) => ({
              version,
              kind,
              clues: stage.clues,
              index,
            })),
        );
    const used = { bridge2: 0, bridge3: 0, closest: 0 };
    return kinds.map((kind) => {
      const options = byKind[kind];
      if (!options.length) throw new RoundError("Bank soal acak belum lengkap.", 409);
      // Small banks repeat only after every round of that kind has been used.
      return options[used[kind]++ % options.length];
    });
  }
  /**
   * Draws reviewed bridge rounds from the cached retrieval index, one answer hub
   * at a time, without repeating answers or clues inside a match. Scores are
   * evaluated when each round starts, as Mode Acak does per stage.
   */
  function retrieved(
    generator: RandomGenerator,
    kind: "bridge2" | "bridge3",
    count: number,
    taken: { answers: Set<string>; clues: Set<string> },
  ): GeneratedRound[] {
    if (!count) return [];
    const candidates = retrieveCandidates(
      generator,
      kind,
      trainDifficulty([]),
      new Set(generator.excludedCombos),
    );
    const hubs = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const list = hubs.get(candidate.answer) ?? [];
      list.push(candidate);
      hubs.set(candidate.answer, list);
    }
    const rounds: GeneratedRound[] = [];
    for (const answer of shuffled([...hubs.keys()])) {
      if (rounds.length >= count) break;
      if (taken.answers.has(answer)) continue;
      const options = hubs
        .get(answer)!
        .filter((c) => !c.round.clues.some((clue) => taken.clues.has(clue)));
      if (!options.length) continue;
      // Prefer well-separated, relevant clue sets within the hub.
      options.sort(
        (a, b) => b.relevance + b.separation - (a.relevance + a.separation),
      );
      const chosen = options[randomInt(Math.min(3, options.length))];
      taken.answers.add(answer);
      chosen.round.clues.forEach((clue) => taken.clues.add(clue));
      rounds.push({
        ...chosen.round,
        clues: shuffled(chosen.round.clues),
        target: chosen.answer,
        features: chosen.features,
      });
    }
    return rounds;
  }
  const key = (ref: RoundRef) =>
    `${ref.version}/${ref.round ? JSON.stringify(ref.round) : ref.index}`;
  function remember(ref: RoundRef, stage: PublishedStage) {
    if (stages.size >= 8) stages.delete(stages.keys().next().value!);
    stages.set(key(ref), stage);
  }
  function stage(ref: RoundRef): PublishedStage {
    const cached = stages.get(key(ref));
    if (cached) return cached;
    const data = snapshot(ref.version);
    let value: PublishedStage | null;
    if (ref.round) value = evaluateRound(data.generator!, ref.round);
    else {
      const descriptor = data.stages[ref.index!];
      value =
        descriptor?.kind === "closest" && data.generator?.version === 4
          ? evaluateClosest(data.generator, descriptor)
          : descriptor;
    }
    if (!value) throw new RoundError("Soal babak ini tidak valid.", 409);
    remember(ref, value);
    return value;
  }
  /** Applies the solo game's alias, block and clue rules before scoring. */
  function score(ref: RoundRef, input: string): { word: string; entry: ScoreEntry } {
    const data = snapshot(ref.version),
      typed = normalizeWord(input),
      word = Object.hasOwn(data.aliases, typed) ? data.aliases[typed] : typed;
    if (!/^[a-z]+$/.test(typed) || data.blocked.includes(word))
      throw new RoundError("Pakai satu kata Indonesia yang sesuai, ya.");
    const published = stage(ref);
    if (published.clues.includes(word))
      throw new RoundError("Cari kata lain selain petunjuknya, ya.");
    const entry = Object.hasOwn(published.scores, word)
      ? published.scores[word]
      : undefined;
    if (!entry)
      throw new RoundError("Kata ini belum ada di kamus Nyambung. Coba kata lain.");
    return { word, entry };
  }
  return { pick, stage, score };
}
export type RoundSource = ReturnType<typeof createRoundSource>;

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { openDatabase, type Store } from "../apps/api/src/db.js";
import {
  createMabar,
  type MabarService,
  type MabarIdentity,
} from "../apps/api/src/mabar.js";
import { compileRandomPool, publishRandomPool } from "../scripts/content.js";
import { createApp } from "../apps/api/src/app.js";
let store: Store, service: MabarService, now: number;
const players = Array.from(
  { length: 12 },
  (_, n): MabarIdentity => ({
    id: `p${n}`,
    name: `Pemain ${n}`,
    avatar: null,
    source: "web",
  }),
);
const opts = {
  name: "Room uji",
  visibility: "public",
  capacity: 12,
  mode: "quick",
  rounds: 5,
  seconds: 20,
};
function cmd(
  room: string,
  p: MabarIdentity,
  type: string,
  payload?: unknown,
  id = randomUUID(),
) {
  const m = service.view(room, p).match;
  service.command(room, p, {
    id,
    type,
    payload,
    matchId: m?.id,
    stage: m?.stage,
  });
  return id;
}
function setup(mode = "quick", count = 2) {
  const r = service.create(players[0], {
    ...opts,
    mode,
    rounds: mode === "word" ? 3 : mode === "chain" ? 1 : 5,
    seconds: mode === "word" ? 10 : mode === "semantic" ? 30 : 20,
  });
  for (const p of players.slice(1, count)) service.join(r.id, p);
  return r.id;
}
function start(room: string, count = 2) {
  for (const p of players.slice(0, count)) cmd(room, p, "ready");
  cmd(room, players[0], "start");
  now += 3000;
  service.tick();
  return service.view(room, players[0]);
}
function deadline(room: string) {
  now = service.view(room, players[0]).match!.deadline;
  service.tick();
}
beforeEach(() => {
  store = openDatabase(":memory:");
  now = 100000;
  for (const p of players)
    store.sqlite
      .prepare("INSERT INTO players VALUES(?,?)")
      .run(p.id, "2026-10-26");
  publishRandomPool(store, compileRandomPool(store, true), true);
  service = createMabar(store, () => now, limit=>limit-1);
});
/** The published Tebak Cepat stage behind the current round (demo bank). */
function quickStage(room: string) {
  const state = JSON.parse(
    (
      store.sqlite
        .prepare("SELECT state FROM mabar_rooms WHERE id=?")
        .get(room) as { state: string }
    ).state,
  );
  const ref = state.match.stages[state.match.stage];
  const snapshot = JSON.parse(
    (
      store.sqlite
        .prepare("SELECT snapshot FROM puzzle_versions WHERE id=?")
        .get(ref.version) as { snapshot: string }
    ).snapshot,
  );
  return { state, stage: snapshot.stages[ref.index] };
}
afterEach(() => store.sqlite.close());
describe("mabar rooms", () => {
  it("applies the correct default preset for each mode", () => {
    for (const [mode, rounds, seconds] of [
      ["quick", 10, 20],
      ["word", 3, 10],
      ["chain", 1, 30],
    ] as const) {
      const room = service.create(players[0], { name: "Preset", mode });
      expect(room.settings).toMatchObject({ mode, rounds, seconds });
    }
  });
  it("lists public rooms without exposing passwords and protects unlisted rooms", () => {
    service.create(players[0], { ...opts, password: "rahasia" });
    service.create(players[0], {
      ...opts,
      name: "Privat",
      visibility: "unlisted",
    });
    expect(service.list()).toHaveLength(1);
    expect(JSON.stringify(service.list())).not.toContain("rahasia");
    const id = service.list()[0].id;
    expect(() => service.join(id, players[1], "salah")).toThrow("Password");
    expect(service.join(id, players[1], "rahasia").count).toBe(2);
  });
  it("caps capacity, changes host and bans only in the room", () => {
    const room = service.create(players[0], { ...opts, capacity: 2 }).id;
    service.join(room, players[1]);
    expect(() => service.join(room, players[2])).toThrow("penuh");
    cmd(room, players[0], "ban", players[1].id);
    expect(() => service.join(room, players[1])).toThrow("tidak dapat");
    service.join(room, players[2]);
    service.leave(room, players[0]);
    expect(service.view(room, players[2]).members.find((p) => p.host)?.id).toBe(
      players[2].id,
    );
  });
  it("rejects settings and moderation from non hosts, and duplicate commands do not toggle twice", () => {
    const room = setup();
    const id = cmd(room, players[0], "ready");
    cmd(room, players[0], "ready", undefined, id);
    expect(service.view(room, players[0]).members[0].ready).toBe(true);
    expect(() => cmd(room, players[1], "kick", players[0].id)).toThrow("host");
    expect(() => cmd(room, players[1], "settings", opts)).toThrow("host");
  });
  it("makes late joiners spectators and keeps their chat out of active games", () => {
    const room = setup();
    start(room);
    expect(service.join(room, players[2]).members.at(-1)?.spectator).toBe(true);
    expect(() => cmd(room, players[2], "answer", "helm")).toThrow("menonton");
    expect(() => cmd(room, players[2], "chat", "hai")).toThrow("selesai");
  });
  it("isolates web and verified Discord instance rooms and auto reuses the same lobby", () => {
    const i = {
      ...players[0],
      source: "discord" as const,
      discordKey: "app:instance",
      guildId: "guild",
      channelId: "channel",
    };
    const room = service.create(i, opts);
    expect(service.create(i, opts).id).toBe(room.id);
    expect(service.list()).toHaveLength(0);
    expect(() => service.join(room.id, players[1])).toThrow("sesi");
    expect(() =>
      service.join(room.id, { ...i, id: "p1", discordKey: "app:other" }),
    ).toThrow("sesi");
    expect(service.report("channel", "guild")?.players).toHaveLength(1);
  });
  it("expires single use tickets, preserves reconnect scores and transfers a disconnected host", () => {
    const room = setup();
    const token = service.ticket(room, players[0]);
    expect(service.redeem(token).identity.id).toBe("p0");
    expect(() => service.redeem(token)).toThrow("kedaluwarsa");
    const expired = service.ticket(room, players[0]);
    now += 30000;
    expect(() => service.redeem(expired)).toThrow("kedaluwarsa");
    service.touch(room, players[0], true);
    now += 60000;
    service.touch(room, players[1]);
    service.tick();
    expect(service.view(room, players[1]).members.find((p) => p.host)?.id).toBe(
      "p1",
    );
    service.touch(room, players[0]);
    expect(service.view(room, players[0]).members[0].online).toBe(true);
  });
  it("rejects expired Discord identities", () => {
    const i = {
      ...players[0],
      source: "discord" as const,
      discordKey: "app:instance",
      expiresAt: now + 1000,
    };
    const room = service.create(i, opts);
    now += 1000;
    expect(() => service.view(room.id, i)).toThrow("Sesi habis");
  });
  it("closes a web room as soon as its last member leaves", () => {
    const room = setup();
    service.leave(room, players[0]);
    expect(service.list().map((r) => r.id)).toContain(room);
    service.leave(room, players[1]);
    expect(service.list().map((r) => r.id)).not.toContain(room);
    expect(() => service.view(room, players[1])).toThrow("ditutup");
    expect(() => service.join(room, players[1])).toThrow("ditutup");
  });
  it("closes disconnected web rooms after fifteen minutes", () => {
    const room = setup();
    service.touch(room, players[0], true);
    service.touch(room, players[1], true);
    service.tick();
    // Nobody online: hidden from the public list while it waits to expire.
    expect(service.list().map((r) => r.id)).not.toContain(room);
    service.touch(room, players[1]);
    expect(service.list().map((r) => r.id)).toContain(room);
    service.touch(room, players[1], true);
    service.tick();
    now += 900000;
    service.tick();
    expect(() => service.view(room, players[0])).toThrow("ditutup");
  });
  it("cancels active matches on restart and preserves completed match history", () => {
    const room = setup();
    start(room);
    service = createMabar(store, () => now);
    const view = service.view(room, players[0]);
    expect(view.match).toBeNull();
    expect(view.notice).toContain("dibatalkan");
    expect(
      store.sqlite.prepare("SELECT count(*) AS n FROM runs").get(),
    ).toEqual({ n: 0 });
  });
});
describe("server authoritative matches", () => {
  it("draws mixed Mode Acak rounds, hides answers and ends a round once everyone answers", () => {
    const room = setup("quick");
    let view = start(room);
    const { state, stage } = quickStage(room);
    expect(state.match.stages).toHaveLength(5);
    expect(new Set(state.match.stages.map((r: { kind: string }) => r.kind))).toEqual(
      new Set(["bridge2", "bridge3", "closest"]),
    );
    expect(view.match!.kind).toBe(stage.kind);
    expect(view.match!.clues).toEqual(stage.clues);
    expect(JSON.stringify(view)).not.toContain(`"${stage.best}"`);
    cmd(room, players[0], "answer", stage.best);
    const waiting=service.view(room, players[1]);
    expect(waiting.match!.reveal).toBeUndefined();
    expect(waiting.match!.answered).toEqual([players[0].id]);
    expect(waiting.members.every(player=>player.score===0)).toBe(true);
    expect(JSON.stringify(waiting)).not.toContain(`"${stage.best}"`);
    const stale = {
      id: randomUUID(),
      type: "answer",
      matchId: view.match!.id,
      stage: 0,
      payload: stage.best,
    };
    cmd(room, players[1], "answer", stage.best);
    view = service.view(room, players[0]);
    expect(view.match!.phase).toBe("reveal");
    expect(view.match!.reveal).toMatchObject({ answer: stage.best });
    expect(view.match!.reveal?.explanation).toBeTruthy();
    expect(view.match!.reveal?.answers).toHaveLength(2);
    expect(view.members[0].rank).toBe(view.members[1].rank);
    deadline(room);
    expect(service.view(room,players[1]).match!.answered).toEqual([]);
    expect(() => service.command(room, players[0], stale)).toThrow("Tahap");
    while (service.view(room, players[0]).match!.phase !== "results")
      deadline(room);
    expect(
      store.sqlite.prepare("SELECT count(*) AS n FROM mabar_matches").get(),
    ).toEqual({ n: 1 });
  });
  it("scores meaning with a speed bonus and lets unknown words be retried", () => {
    const room = setup("quick");
    start(room);
    const { stage } = quickStage(room);
    expect(() => cmd(room, players[0], "answer", "constructor")).toThrow("kamus");
    expect(() => cmd(room, players[0], "answer", stage.clues[0])).toThrow(
      "petunjuk",
    );
    now += 10000;
    cmd(room, players[0], "answer", stage.best);
    deadline(room);
    const answer = service.view(room, players[0]).match!.reveal!.answers[0];
    // Half of the 20 second round has passed: quality 1000 keeps 75%.
    expect(answer).toMatchObject({ word: stage.best, quality: 1000, score: 750 });
    expect(
      store.sqlite.prepare("SELECT count(*) AS n FROM runs").get(),
    ).toEqual({ n: 0 });
  });
  it("keeps quick match state small and moves old Nyambung Bareng rooms to Tebak Cepat", () => {
    const room = setup("quick");
    start(room);
    expect(quickStage(room).state.match.stages[0]).not.toHaveProperty("scores");
    expect(
      (
        store.sqlite
          .prepare("SELECT state FROM mabar_rooms WHERE id=?")
          .get(room) as { state: string }
      ).state.length,
    ).toBeLessThan(15000);
    const legacy = service.create(players[2], { ...opts, name: "Lama" }).id;
    const row = store.sqlite
      .prepare("SELECT state FROM mabar_rooms WHERE id=?")
      .get(legacy) as { state: string };
    const state = JSON.parse(row.state);
    state.settings.mode = "semantic";
    store.sqlite
      .prepare("UPDATE mabar_rooms SET state=? WHERE id=?")
      .run(JSON.stringify(state), legacy);
    service = createMabar(store, () => now);
    expect(service.view(legacy, players[2]).settings.mode).toBe("quick");
  });
  it("Sambung Kata validates letters, turns and repeated words", () => {
    const room = setup("word");
    let view = start(room);
    const who = players.find((p) => p.id === view.match!.turn)!;
    const other = players.find((p) => p.id !== who.id && p.id < "p2")!;
    expect(view.match!.turnSeconds).toBe(10);
    expect(() => cmd(room, other, "answer", "hujan")).toThrow("giliran");
    cmd(room, who, "answer", "hujan");
    view = service.view(room, players[0]);
    // A correct word passes the turn immediately, without a reveal pause.
    expect(view.match).toMatchObject({ phase: "playing", turn: other.id, prompt: "hujan", round: 1 });
    cmd(room, other, "answer", "nasi");
    view = service.view(room, players[0]);
    expect(view.match).toMatchObject({ turn: who.id, round: 2, turnSeconds: 9 });
    cmd(room, who, "answer", "ikan");
    cmd(room, other, "answer", "nanas");
    cmd(room, who, "answer", "sabun");
    const unchanged=service.view(room,other).match;
    expect(()=>cmd(room, other, "answer", "nasi")).toThrow('sudah dipakai');
    expect(service.view(room,other).match).toEqual(unchanged);
    expect(service.view(room,other).match!.lives).toEqual({[who.id]:2,[other.id]:2});
    expect(service.view(room, other).match!.used).toEqual(
      expect.arrayContaining(["rumah", "hujan", "nasi", "ikan", "nanas", "sabun"]),
    );
  });
  it('Sambung Kata spends two lives, ignores repeated/stale commands and eliminates only at zero',()=>{
    const room=setup('word');let view=start(room);
    const first=players.find(p=>p.id===view.match!.turn)!,other=players.find(p=>p.id!==first.id&&p.id<'p2')!;
    expect(view.match!.lives).toEqual({[first.id]:2,[other.id]:2});
    expect(()=>cmd(room,other,'answer','hujan')).toThrow('giliran');
    const stale={matchId:view.match!.id,stage:view.match!.stage};
    const id=cmd(room,first,'answer','NaSi');
    view=service.view(room,first);
    expect(view.match).toMatchObject({phase:'reveal',lives:{[first.id]:1,[other.id]:2},eliminated:[]});
    expect(view.match!.reveal!.lostLife).toMatchObject({playerId:first.id,remaining:1,attempt:'NaSi',prefix:'h'});
    const examples=view.match!.reveal!.lostLife!.examples!;expect(examples.length).toBe(3);expect(examples.length).toBeLessThanOrEqual(3);
    for(const word of examples){expect(word.startsWith('h')).toBe(true);expect(lexicon).toContain(word);expect(view.match!.used).not.toContain(word);}
    expect(service.view(room,other).match!.reveal!.lostLife).toEqual(view.match!.reveal!.lostLife);
    expect(view.match!.reveal!.lostLife!.reason).toContain('H sesuai pilihan server');
    cmd(room,first,'answer','nasi',id);
    expect(service.view(room,first).match!.lives![first.id]).toBe(1);
    deadline(room);
    expect(()=>service.command(room,first,{id:randomUUID(),type:'answer',payload:'nasi',...stale})).toThrow('Tahap');
    cmd(room,other,'answer','zzzzzzzz');deadline(room);
    cmd(room,first,'answer','nasi');view=service.view(room,first);
    expect(view.match!.lives![first.id]).toBe(0);
    expect(view.match!.reveal!.eliminated).toBe(first.id);
    deadline(room);
    expect(service.view(room,other).match!.phase).toBe('results');
    expect(service.view(room,other).match!.lives![other.id]).toBe(1);
  });
  it('Sambung Kata removes one life per timeout and crowns the final survivor',()=>{
    const room=setup('word',3);let view=start(room,3);
    const first=view.match!.turn!;
    deadline(room);view=service.view(room,players[0]);
    expect(view.match).toMatchObject({phase:'reveal',eliminated:[],lives:{[first]:1}});
    expect(view.match!.reveal!.eliminated).toBeUndefined();
    expect(view.match!.reveal!.lostLife!.attempt).toBeUndefined();
    expect(view.match!.reveal!.lostLife!.examples!.length).toBe(3);
    deadline(room);view=service.view(room,players[0]);
    const second=view.match!.turn!,winner=players.find(p=>p.id===second)!;
    cmd(room,winner,'answer','hujan');
    const third=service.view(room,players[0]).match!.turn!;
    deadline(room);deadline(room); // Third loses one life, back to first.
    deadline(room);view=service.view(room,players[0]); // First loses the last life.
    expect(view.match!.reveal!.eliminated).toBe(first);
    deadline(room);
    expect(()=>cmd(room,players.find(p=>p.id===first)!,'answer','nasi')).toThrow('gugur');
    deadline(room);deadline(room); // Second loses one life.
    deadline(room);deadline(room); // Third loses the last life.
    view=service.view(room,players[0]);
    expect(view.match!.phase).toBe('results');
    expect(view.members.find(p=>p.id===second)).toMatchObject({rank:1,score:600});
    expect(view.match!.lives).toMatchObject({[first]:0,[second]:1,[third]:0});
  });
  for (const count of [3, 4, 12])
    it(`rotates ${count} private chains and completes gallery/voting`, () => {
      const room = setup("chain", count);
      start(room, count);
      const ids = players.slice(0, count);
      for (let stage = 0; stage < count; stage++) {
        for (const p of ids) {
          const v = service.view(room, p);
          expect(v.match!.task).toBe(stage % 2 ? "drawing" : "text");
          expect(v.match!.gallery).toBeUndefined();
          if (stage === 0) expect(v.match!.previous).toBeUndefined();
          cmd(
            room,
            p,
            "submit",
            stage % 2
              ? {
                  drawing: [
                    {
                      color: "#111111",
                      size: 3,
                      points: [
                        [10, 10],
                        [20, 20],
                      ],
                    },
                  ],
                }
              : { text: `kata ${p.id}` },
          );
        }
        now += 3000;
        service.tick();
      }
      let view = service.view(room, players[0]);
      expect(view.match!.phase).toBe("gallery");
      expect(view.match!.gallery).toHaveLength(1);
      for (let n = 0; n < count; n++) cmd(room, players[0], "gallery-next");
      view = service.view(room, players[0]);
      expect(view.match!.phase).toBe("voting");
      for (const chain of view.match!.gallery!) {
        expect(chain.entries).toHaveLength(count);
        expect(new Set(chain.entries.map((e) => e.playerId)).size).toBe(count);
      }
      const owner = view.match!.gallery![0].owner;
      const voter = ids.find((p) => p.id !== owner)!;
      expect(() =>
        cmd(room, ids.find((p) => p.id === owner)!, "vote", 0),
      ).toThrow("lain");
      cmd(room, voter, "vote", 0);
      expect(() => cmd(room, voter, "vote", 1)).toThrow("dikunci");
      deadline(room);
      expect(
        service.view(room, players[0]).members.find((p) => p.id === owner)
          ?.score,
      ).toBe(1);
    });
  it("persists only private drafts and permits skipped chain tasks", () => {
    const room = setup("chain", 3);
    start(room, 3);
    cmd(room, players[0], "draft", { text: "rahasia" });
    expect(service.view(room, players[0]).match!.draft?.text).toBe("rahasia");
    expect(JSON.stringify(service.view(room, players[1]))).not.toContain(
      "rahasia",
    );
    deadline(room);
    expect(service.view(room, players[0]).match!.stage).toBe(1);
  });
});
it("HTTP profile and feature flag integrate with existing guest cookies", async () => {
  const disabled = createApp(store);
  expect(
    (await (await disabled.request("/api/mabar/config")).json()).enabled,
  ).toBe(false);
  const app = createApp(store, undefined, { mabar: service });
  const response = await app.request("/api/mabar/profile");
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const profile = await app.request("/api/mabar/profile", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Tamu Pixel" }),
  });
  expect(profile.status).toBe(200);
  expect((await profile.json()).name).toBe("Tamu Pixel");
  const create = await app.request("/api/mabar/rooms", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  expect(create.status).toBe(200);
  const publicRoom = await create.json();
  expect(JSON.stringify(publicRoom)).not.toContain(cookie.split("=")[1]);
  const forged = await app.request("/api/mabar/profile", {
    headers: { cookie: "nyambung_session=" + publicRoom.self },
  });
  expect(await forged.json()).toBeNull();
  expect(
    (
      await (
        await app.request("/api/mabar/profile", { headers: { cookie } })
      ).json()
    ).name,
  ).toBe("Tamu Pixel");
});
it("exports only safe bot state and renders a CRT card with Unicode players", async () => {
  const { renderMabarCard } = await import("../apps/api/src/discord-card.js");
  const identity = {
    ...players[0],
    name: "Tamu 雨",
    source: "discord" as const,
    discordKey: "app:one",
    guildId: "g",
    channelId: "c",
  };
  service.create(identity, opts);
  const card = service.report("c", "g")!;
  expect(JSON.stringify(card)).not.toMatch(/password|questions|drafts|chains/);
  expect(card.players[0].score).toBeNull();
  const png = await renderMabarCard(card);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
});

it("keeps disconnected Discord rooms until Discord confirms their instance ended", async () => {
  const identity = {
    ...players[0],
    source: "discord" as const,
    discordKey: "app:instance",
  };
  const room = service.create(identity, opts);
  service.touch(room.id, identity, true);
  service.tick();
  now += 60001;
  service.tick();
  await service.reapDiscord(async () => true);
  expect(service.view(room.id, identity).id).toBe(room.id);
  await expect(
    service.reapDiscord(async () => {
      throw new Error("Upstream offline");
    }),
  ).rejects.toThrow();
  expect(service.view(room.id, identity).id).toBe(room.id);
  await service.reapDiscord(async () => false);
  expect(() => service.view(room.id, identity)).toThrow("ditutup");
});

import {wordChainSuffixes} from '@nyambung/shared';
import lexicon from '../content/lexicon.json';
import {wordChainFamiliarWords} from '../content/word-chain.js';
it('chooses a single feasible server prefix of 1, 2, 3 or 4 letters and keeps it fixed on retry',()=>{
  const dictionary=new Set(lexicon.filter(word=>/^[a-z]{2,32}$/.test(word)));
  const familiar=wordChainFamiliarWords.filter(word=>dictionary.has(word));
  const used=new Set(['rumah']);let previous='rumah',length=1;
  service=createMabar(store,()=>now,limit=>{
    const options=wordChainSuffixes(previous).filter(prefix=>prefix.length<previous.length&&familiar.filter(word=>word.startsWith(prefix)&&!used.has(word)).length>=3).flatMap(prefix=>Array<string>([0,3,3,3,1][prefix.length]).fill(prefix));
    expect(options.length).toBe(limit);
    const selected=options.findIndex(prefix=>prefix.length===length);expect(selected).toBeGreaterThanOrEqual(0);return selected;
  });
  const room=setup('word');start(room);
  const steps:[string,number][]=[['hujan',3],['jantung',4],['tungku',2],['kuda',2],['daun',2],['ungu',1],['udang',1],['gagak',1],['kangen',1],['nanti',2],['tikus',1]];
  const lengths=new Set<number>();
  for(const [word,nextLength] of steps){
    const before=service.view(room,players[0]);const who=players.find(p=>p.id===before.match!.turn)!;
    const prefix=before.match!.requiredPrefix!;lengths.add(prefix.length);expect(word.startsWith(prefix)).toBe(true);
    expect(()=>cmd(room,who,'answer','rumah')).toThrow('sudah dipakai');
    expect(service.view(room,who).match).toEqual(before.match);
    previous=word;length=nextLength;used.add(word);
    cmd(room,who,'answer',word);
    const next=service.view(room,who);expect(next.match!.prompt).toBe(word);expect(next.match!.phase).toBe('playing');
    expect(next.match!.requiredPrefix!.length).toBeLessThan(word.length);
    if(word==='daun')expect(next.match!.requiredPrefix).not.toBe('daun');
    if(word==='kangen')expect(next.match!.requiredPrefix).not.toBe('ngen');
    if(word==='nanti')expect(['ti','i']).toContain(next.match!.requiredPrefix);
    expect(Object.values(next.match!.lives!).every(lives=>lives===2)).toBe(true);
  }
  expect([...lengths].sort()).toEqual([1,2,3,4]);
});
it('rejects a player-selected shorter suffix and never rerolls on view or replay',()=>{
  service=createMabar(store,()=>now,()=>0);
  const room=setup('word');const before=start(room);const who=players.find(p=>p.id===before.match!.turn)!;
  expect(before.match!.requiredPrefix!.length).toBeGreaterThan(1);
  for(let n=0;n<5;n++)expect(service.view(room,who).match!.requiredPrefix).toBe(before.match!.requiredPrefix);
  const id=cmd(room,who,'answer','hujan');
  const rejected=service.view(room,who);expect(rejected.match!.phase).toBe('reveal');expect(rejected.match!.lives![who.id]).toBe(1);
  expect(rejected.match!.reveal!.lostLife!.reason).toContain(before.match!.requiredPrefix!.toUpperCase());
  cmd(room,who,'answer','hujan',id);expect(service.view(room,who).match).toEqual(rejected.match);
});

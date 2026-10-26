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
  service = createMabar(store, () => now);
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
    expect(service.view(room, players[1]).match!.reveal).toBeUndefined();
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
    expect(() => cmd(room, who, "answer", "nasi")).toThrow("huruf H");
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
    expect(() => cmd(room, other, "answer", "nasi")).toThrow("sudah dipakai");
    expect(service.view(room, other).match!.used).toEqual(
      expect.arrayContaining(["rumah", "hujan", "nasi", "ikan", "nanas", "sabun"]),
    );
  });
  it("Sambung Kata eliminates a player who runs out of time and crowns the survivor", () => {
    const room = setup("word", 3);
    let view = start(room, 3);
    const first = view.match!.turn!;
    deadline(room);
    view = service.view(room, players[0]);
    expect(view.match).toMatchObject({ phase: "reveal", eliminated: [first] });
    expect(view.match!.reveal?.eliminated).toBe(first);
    deadline(room);
    view = service.view(room, players[0]);
    expect(view.match!.phase).toBe("playing");
    const second = view.match!.turn!;
    expect(second).not.toBe(first);
    const p = players.find((x) => x.id === second)!;
    cmd(room, p, "answer", "hujan");
    view = service.view(room, players[0]);
    // The eliminated player is skipped when the turn wraps around.
    expect(view.match!.turn).not.toBe(first);
    const third = view.match!.turn!;
    expect(() =>
      cmd(room, players.find((x) => x.id === first)!, "answer", "nasi"),
    ).toThrow("gugur");
    deadline(room);
    deadline(room);
    view = service.view(room, players[0]);
    expect(view.match!.phase).toBe("results");
    const winner = view.members.find((m) => m.id === second)!;
    expect(winner).toMatchObject({ rank: 1, score: 600 });
    expect(view.members.find((m) => m.id === third)!.score).toBe(0);
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

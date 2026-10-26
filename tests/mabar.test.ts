import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { openDatabase, type Store } from "../apps/api/src/db.js";
import {
  createMabar,
  type MabarService,
  type MabarIdentity,
} from "../apps/api/src/mabar.js";
import { quickQuestions } from "../content/mabar-questions.js";
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
  service = createMabar(store, () => now);
});
afterEach(() => store.sqlite.close());
describe("mabar rooms", () => {
  it("has at least 100 unique reviewed questions with explicit answers", () => {
    expect(quickQuestions.length).toBeGreaterThanOrEqual(100);
    expect(new Set(quickQuestions.map((q) => q.prompt)).size).toBe(
      quickQuestions.length,
    );
    expect(
      quickQuestions.every((q) => q.answers.length && q.answers.every(Boolean)),
    ).toBe(true);
  });
  it("applies the correct default preset for each mode", () => {
    for (const [mode, rounds, seconds] of [
      ["quick", 10, 20],
      ["semantic", 5, 30],
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
  it("closes empty web rooms after fifteen minutes", () => {
    const room = setup();
    service.leave(room, players[0]);
    service.leave(room, players[1]);
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
  it("runs quick rounds, hides answers, rejects late/stale guesses and ranks ties equally", () => {
    const room = setup();
    let view = start(room);
    const question = quickQuestions.find(
      (q) => q.prompt === view.match!.prompt,
    )!;
    expect(JSON.stringify(view)).not.toContain('"questions"');
    cmd(room, players[0], "answer", question.answers[0]);
    cmd(room, players[1], "answer", question.answers[0]);
    expect(service.view(room, players[1]).match!.reveal).toBeUndefined();
    const stale = {
      id: randomUUID(),
      type: "answer",
      matchId: view.match!.id,
      stage: 0,
      payload: question.answers[0],
    };
    deadline(room);
    view = service.view(room, players[0]);
    expect(view.match!.reveal?.answers).toHaveLength(2);
    expect(view.members[0].rank).toBe(view.members[1].rank);
    expect(() =>
      cmd(room, players[0], "answer", question.answers[0]),
    ).toThrow();
    deadline(room);
    expect(() => service.command(room, players[0], stale)).toThrow("Tahap");
    while (service.view(room, players[0]).match!.phase !== "results")
      deadline(room);
    expect(
      store.sqlite.prepare("SELECT count(*) AS n FROM mabar_matches").get(),
    ).toEqual({ n: 1 });
  });
  it("rate limits incorrect quick guesses without locking a valid retry", () => {
    const room = setup();
    const view = start(room);
    const answer = quickQuestions.find((q) => q.prompt === view.match!.prompt)!
      .answers[0];
    expect(() => cmd(room, players[0], "answer", "salah")).toThrow(
      "Belum tepat",
    );
    expect(() => cmd(room, players[0], "answer", answer)).toThrow("cepat");
    now += 1000;
    cmd(room, players[0], "answer", answer);
    expect(service.view(room, players[0]).match?.submitted).toBe(true);
  });
  it("uses published random semantics and does not write solo progress", () => {
    publishRandomPool(store, compileRandomPool(store, true), true);
    const room = setup("semantic");
    start(room);
    const state = JSON.parse(
      (
        store.sqlite
          .prepare("SELECT state FROM mabar_rooms WHERE id=?")
          .get(room) as { state: string }
      ).state,
    );
    const ref = state.match.stages[0];
    const snapshot = JSON.parse(
      (
        store.sqlite
          .prepare("SELECT snapshot FROM puzzle_versions WHERE id=?")
          .get(ref.version) as { snapshot: string }
      ).snapshot,
    );
    const stage = snapshot.stages[ref.index];
    cmd(room, players[0], "answer", stage.best);
    expect(() => cmd(room, players[1], "answer", "constructor")).toThrow(
      "kamus",
    );
    deadline(room);
    expect(service.view(room, players[1]).match!.reveal?.answers[0].score).toBe(
      stage.scores[stage.best].score,
    );
    expect(
      store.sqlite.prepare("SELECT count(*) AS n FROM runs").get(),
    ).toEqual({ n: 0 });
    expect(JSON.stringify(state).length).toBeLessThan(15000);
  });
  it("validates last letters, repeated words, turn ownership and timeout advancement", () => {
    const room = setup("word");
    let view = start(room);
    const who = players.find((p) => p.id === view.match!.turn)!;
    const other = players.find((p) => p.id !== who.id)!;
    expect(() => cmd(room, other, "answer", "hujan")).toThrow("giliran");
    expect(() => cmd(room, who, "answer", "nasi")).toThrow("Huruf");
    cmd(room, who, "answer", "hujan");
    expect(service.view(room, who).match!.phase).toBe("reveal");
    deadline(room);
    view = service.view(room, players[0]);
    expect(view.match!.turn).toBe(other.id);
    cmd(room, other, "answer", "nasi");
    deadline(room);
    deadline(room);
    expect(service.view(room, players[0]).match!.reveal?.answers).toEqual([]);
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

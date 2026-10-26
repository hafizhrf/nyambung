import {
  createHash,
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  commandSchema,
  drawingSchema,
  roomSettings,
  normalizeWord,
  type RoomView,
  type RoomSettings,
  type GuestProfile,
  type ChainEntry,
  type MatchView,
} from "@nyambung/shared";
import { quickQuestions } from "../../../content/mabar-questions.js";
import lexicon from "../../../content/lexicon.json";
import type { Store } from "./db.js";
import type { PublishedStage, Snapshot } from "./scoring.js";
export class MabarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Player = GuestProfile & {
  joined: number;
  seen: number;
  disconnected: number | null;
  ready: boolean;
  spectator: boolean;
  score: number;
};
type Answer = {
  playerId: string;
  word: string;
  score: number;
  connections?: number[];
};
interface Match {
  id: string;
  mode: RoomSettings["mode"];
  phase: MatchView["phase"];
  stage: number;
  total: number;
  deadline: number;
  started: number;
  order: string[];
  scores: Record<string, number>;
  answers: Answer[];
  history: Answer[][];
  questions: typeof quickQuestions;
  stages: { version: string; index: number }[];
  chains: ChainEntry[][];
  drafts: Record<string, ChainEntry>;
  locked: string[];
  votes: Record<string, number>;
  galleryIndex: number;
  lastWord: string;
  used: string[];
  lastAttempts: Record<string, number>;
}
interface Room {
  id: string;
  discordKey: string | null;
  guildId?: string;
  channelId?: string;
  source: "web" | "discord";
  settings: Omit<RoomSettings, "password">;
  password: string | null;
  host: string;
  members: Player[];
  bans: string[];
  revision: number;
  match: Match | null;
  messages: { id: string; playerId: string; text: string }[];
  notice: string;
  emptySince: number | null;
}
export interface MabarIdentity extends GuestProfile {
  source: "web" | "discord";
  discordKey?: string;
  guildId?: string;
  channelId?: string;
  expiresAt?: number;
  discordId?: string;
}
const clean = (v: string) => normalizeWord(v).replace(/\s+/g, " ");
const shuffled = <T>(items: T[]) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .refine((s) => !/[\x00-\x1f\x7f]/.test(s));
export function createMabar(store: Store, clock: () => number = Date.now) {
  const sql = store.sqlite,
    dictionary = new Set(lexicon.filter((w) => /^[a-z]{2,32}$/.test(w))),
    tickets = new Map<
      string,
      { room: string; identity: MabarIdentity; until: number }
    >(),
    rates = new Map<string, { at: number; n: number }>();
  const roomCache = new Map<string, Room>();
  const snapshotCache = new Map<string, Snapshot>();
  function published(ref: { version: string; index: number }) {
    let snapshot = snapshotCache.get(ref.version);
    if (!snapshot) {
      const row = sql
        .prepare("SELECT snapshot FROM puzzle_versions WHERE id=?")
        .get(ref.version) as { snapshot: string };
      snapshot = JSON.parse(row.snapshot);
      if (snapshotCache.size >= 2)
        snapshotCache.delete(snapshotCache.keys().next().value!);
      snapshotCache.set(ref.version, snapshot!);
    }
    return snapshot!.stages[ref.index];
  }
  const listeners = new Set<(id: string) => void>();
  const rows = () =>
    sql.prepare("SELECT state FROM mabar_rooms").all() as { state: string }[];
  function save(r: Room) {
    r.revision++;
    sql
      .prepare(
        "INSERT INTO mabar_rooms(id,discord_key,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at",
      )
      .run(r.id, r.discordKey, JSON.stringify(r), clock());
    roomCache.set(r.id, r);
  }
  function emit(r: Room) {
    for (const cb of listeners) cb(r.id);
  }
  function get(id: string): Room {
    const row = sql
      .prepare("SELECT state FROM mabar_rooms WHERE id=?")
      .get(id) as { state: string } | undefined;
    if (!row) throw new MabarError("Room sudah ditutup.", 404);
    return JSON.parse(row.state);
  }
  function member(r: Room, id: string) {
    const p = r.members.find((p) => p.id === id);
    if (!p) throw new MabarError("Kamu belum bergabung.", 403);
    return p;
  }
  function access(r: Room, i: MabarIdentity) {
    if (i.expiresAt && i.expiresAt <= clock())
      throw new MabarError("Sesi habis. Sambungkan ulang.", 401);
    if (
      r.source !== i.source ||
      (r.source === "discord" && r.discordKey !== i.discordKey)
    )
      throw new MabarError("Room tidak tersedia untuk sesi ini.", 403);
  }
  function limit(key: string, max: number, ms = 60000) {
    if (rates.size > 20000)
      for (const [k, v] of rates) if (v.at < clock()) rates.delete(k);
    let l = rates.get(key);
    if (!l || l.at <= clock()) {
      l = { at: clock() + ms, n: 0 };
      rates.set(key, l);
    }
    if (++l.n > max)
      throw new MabarError("Terlalu cepat. Coba sebentar lagi.", 429);
  }
  function settings(input: unknown) {
    const raw = z
      .object({
        mode: z.enum(["chain", "quick", "semantic", "word"]).default("quick"),
      })
      .passthrough()
      .parse(input);
    const defaults = {
      chain: [1, 30],
      quick: [10, 20],
      semantic: [5, 30],
      word: [3, 10],
    }[raw.mode];
    const s = roomSettings.parse({
      rounds: defaults[0],
      seconds: defaults[1],
      ...raw,
    });
    if (s.mode === "chain" && s.capacity < 3)
      throw new MabarError("Rantai Gambar minimal tiga pemain.");
    const allowed =
      s.mode === "quick"
        ? [
            [5, 10, 15],
            [15, 20, 30],
          ]
        : s.mode === "semantic"
          ? [
              [5, 10],
              [20, 30, 45],
            ]
          : s.mode === "word"
            ? [
                [3, 5, 7],
                [7, 10, 15],
              ]
            : [[1], [20, 30, 45]];
    if (
      s.mode !== "chain" &&
      (!allowed[0].includes(s.rounds) || !allowed[1].includes(s.seconds))
    )
      throw new MabarError("Preset permainan tidak valid.");
    if (s.password && s.password.length < 4)
      throw new MabarError("Password minimal 4 karakter.");
    return s;
  }
  function password(value: string) {
    const salt = randomBytes(16).toString("hex");
    return salt + ":" + scryptSync(value, salt, 32).toString("hex");
  }
  function verify(value: string, hash: string) {
    const [salt, digest] = hash.split(":");
    return timingSafeEqual(
      scryptSync(value, salt, 32),
      Buffer.from(digest, "hex"),
    );
  }
  function profile(id: string): GuestProfile | null {
    const row = sql
      .prepare("SELECT name,avatar FROM mabar_profiles WHERE player_id=?")
      .get(id) as { name: string; avatar: string | null } | undefined;
    return row
      ? {
          id: createHash("sha256")
            .update("nyambung-mabar-public:" + id)
            .digest("hex"),
          ...row,
        }
      : null;
  }
  function refreshProfile(id: string) {
    const profileValue = profile(id);
    for (const row of rows()) {
      const r = JSON.parse(row.state) as Room;
      const p = r.members.find((p) => p.id === profileValue?.id);
      if (p && r.source === "web" && profileValue) {
        Object.assign(p, profileValue);
        save(r);
        emit(r);
      }
    }
  }
  function updateProfile(id: string, value: unknown) {
    const name = nameSchema.parse(value);
    sql
      .prepare(
        "INSERT INTO mabar_profiles(player_id,name) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET name=excluded.name",
      )
      .run(id, name);
    refreshProfile(id);
    return profile(id)!;
  }
  function avatar(id: string, value: string | null) {
    if (!profile(id)) throw new MabarError("Isi nama profil dahulu.");
    sql
      .prepare("UPDATE mabar_profiles SET avatar=? WHERE player_id=?")
      .run(value, id);
    refreshProfile(id);
    return profile(id)!;
  }
  function summary(r: Room) {
    return {
      id: r.id,
      name: r.settings.name,
      mode: r.settings.mode,
      visibility: r.settings.visibility,
      capacity: r.settings.capacity,
      count: r.members.length,
      locked: !!r.password,
      phase: r.match?.phase ?? "lobby",
      source: r.source,
    };
  }
  function list(query = "", mode = "") {
    return rows()
      .map((v) => JSON.parse(v.state) as Room)
      .filter(
        (r) =>
          r.source === "web" &&
          r.settings.visibility === "public" &&
          r.settings.name
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()) &&
          (!mode || r.settings.mode === mode),
      )
      .slice(0, 100)
      .map(summary);
  }
  function create(i: MabarIdentity, input: unknown) {
    limit("create:" + i.id, 5);
    const s = settings(input);
    if (i.source === "discord" && i.discordKey) {
      const old = sql
        .prepare("SELECT id FROM mabar_rooms WHERE discord_key=?")
        .get(i.discordKey) as { id: string } | undefined;
      if (old) return join(old.id, i);
    }
    const { password: pw, ...opts } = s;
    const r: Room = {
      id: randomBytes(6).toString("hex"),
      discordKey: i.discordKey ?? null,
      guildId: i.guildId,
      channelId: i.channelId,
      source: i.source,
      settings: {
        ...opts,
        visibility: i.source === "discord" ? "unlisted" : opts.visibility,
      },
      password: pw ? password(pw) : null,
      host: i.id,
      members: [],
      bans: [],
      revision: 0,
      match: null,
      messages: [],
      notice: "",
      emptySince: null,
    };
    save(r);
    if (r.source === "discord" && r.channelId && r.guildId)
      sql
        .prepare(
          "INSERT OR IGNORE INTO discord_channel_cards(channel_id,date,guild_id) VALUES(?,?,?)",
        )
        .run(
          r.channelId,
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
            new Date(clock()),
          ),
          r.guildId,
        );
    return join(r.id, i, pw);
  }
  function join(id: string, i: MabarIdentity, pw = "") {
    limit("join:" + i.id, 15);
    const r = get(id);
    access(r, i);
    if (r.bans.includes(i.id))
      throw new MabarError("Kamu tidak dapat masuk room ini.", 403);
    let p = r.members.find((p) => p.id === i.id);
    if (!p) {
      if (r.password && !verify(pw, r.password))
        throw new MabarError("Password room salah.", 403);
      if (r.members.length >= r.settings.capacity)
        throw new MabarError("Room penuh.", 409);
      p = {
        id: i.id,
        name: i.name,
        avatar: i.avatar,
        joined: clock(),
        seen: clock(),
        disconnected: null,
        ready: false,
        spectator: !!r.match && r.match.phase !== "results",
        score: 0,
      };
      r.members.push(p);
    } else
      Object.assign(p, {
        name: i.name,
        avatar: i.avatar,
        seen: clock(),
        disconnected: null,
      });
    if (!r.members.some((p) => p.id === r.host)) r.host = i.id;
    r.emptySince = null;
    save(r);
    emit(r);
    return view(id, i);
  }
  function leave(id: string, i: MabarIdentity, ban = false) {
    const r = get(id);
    access(r, i);
    member(r, i.id);
    r.members = r.members.filter((p) => p.id !== i.id);
    if (ban && !r.bans.includes(i.id)) r.bans.push(i.id);
    if (r.host === i.id)
      r.host =
        r.members
          .filter((p) => p.disconnected === null)
          .sort((a, b) => a.joined - b.joined)[0]?.id ??
        r.members[0]?.id ??
        "";
    if (!r.members.length) r.emptySince = clock();
    save(r);
    emit(r);
  }
  function duration(r: Room, m: Match) {
    return m.mode === "chain"
      ? m.stage % 2 === 1
        ? { fast: 40, normal: 60, relaxed: 90 }[r.settings.pace]
        : { fast: 20, normal: 30, relaxed: 45 }[r.settings.pace]
      : r.settings.seconds;
  }
  function begin(r: Room) {
    const players = r.members.filter((p) => !p.spectator);
    if (
      players.length < (r.settings.mode === "chain" ? 3 : 2) ||
      players.some((p) => !p.ready || p.disconnected !== null)
    )
      throw new MabarError("Tunggu semua pemain siap.");
    const stages: { version: string; index: number }[] = [];
    if (r.settings.mode === "semantic") {
      const snapshots = sql
        .prepare(
          "SELECT DISTINCT v.id,v.snapshot FROM random_pool p JOIN puzzle_versions v ON p.version_id=v.id",
        )
        .all() as { id: string; snapshot: string }[];
      for (const row of snapshots) {
        const snapshot = JSON.parse(row.snapshot) as Snapshot;
        for (let index = 0; index < snapshot.stages.length; index++)
          stages.push({ version: row.id, index });
      }
      if (!stages.length)
        throw new MabarError("Paket Acak belum tersedia.", 409);
    }

    for (const p of r.members) p.score = 0;
    const order = shuffled(players.map((p) => p.id)),
      mode = r.settings.mode;
    r.match = {
      id: randomUUID(),
      mode,
      phase: "countdown",
      stage: 0,
      total:
        mode === "chain"
          ? order.length
          : mode === "word"
            ? r.settings.rounds * order.length
            : r.settings.rounds,
      deadline: clock() + 3000,
      started: clock(),
      order,
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      answers: [],
      history: [],
      questions: shuffled(quickQuestions).slice(0, r.settings.rounds),
      stages:
        mode === "semantic"
          ? Array.from(
              { length: r.settings.rounds },
              (_, n) => stages[n % stages.length],
            )
          : [],
      chains: order.map(() => []),
      drafts: {},
      locked: [],
      votes: {},
      galleryIndex: 0,
      lastWord: "rumah",
      used: ["rumah"],
      lastAttempts: {},
    };
    r.notice = "";
  }
  function chainIndex(m: Match, id: string) {
    return (m.order.indexOf(id) - m.stage + m.order.length) % m.order.length;
  }
  function lastEntry(m: Match, index: number) {
    return [...m.chains[index]].reverse().find((e) => !e.skipped);
  }
  function finish(r: Room) {
    const m = r.match!;
    m.phase = "results";
    m.deadline = 0;
    if (m.mode === "chain") {
      for (const id of m.order)
        m.scores[id] = Object.values(m.votes).filter(
          (n) => m.order[n] === id,
        ).length;
    }
    for (const p of r.members) {
      p.score = m.scores[p.id] ?? 0;
      p.ready = false;
    }
    sql
      .prepare("INSERT OR REPLACE INTO mabar_matches VALUES(?,?,?,?)")
      .run(m.id, r.id, JSON.stringify(m), clock());
  }
  function completeStage(r: Room) {
    const m = r.match!;
    if (m.mode === "chain") {
      for (const id of m.order) {
        const index = chainIndex(m, id);
        const draft = m.drafts[id];
        m.chains[index].push(
          draft && (draft.text || draft.drawing?.length)
            ? draft
            : { playerId: id, skipped: true },
        );
      }
      m.drafts = {};
      m.locked = [];
      m.stage++;
      if (m.stage >= m.total) {
        m.phase = "gallery";
        m.galleryIndex = 0;
        m.deadline = clock() + 20000;
      } else {
        m.started = clock();
        m.deadline = clock() + duration(r, m) * 1000;
      }
      return;
    }
    m.history.push(m.answers);
    m.phase = "reveal";
    m.deadline = clock() + 5000;
    for (const a of m.answers)
      m.scores[a.playerId] = (m.scores[a.playerId] ?? 0) + a.score;
    for (const p of r.members) p.score = m.scores[p.id] ?? 0;
  }
  function advance(r: Room) {
    const m = r.match!;
    if (m.phase === "countdown") {
      m.phase = "playing";
      m.started = clock();
      m.deadline = clock() + duration(r, m) * 1000;
      return;
    }
    if (m.phase === "playing") {
      completeStage(r);
      return;
    }
    if (m.phase === "reveal") {
      m.stage++;
      m.answers = [];
      m.lastAttempts = {};
      if (m.stage >= m.total) {
        finish(r);
        return;
      }
      m.phase = "playing";
      m.started = clock();
      m.deadline = clock() + duration(r, m) * 1000;
      return;
    }
    if (m.phase === "gallery") {
      m.galleryIndex++;
      if (m.galleryIndex >= m.chains.length) {
        m.phase = "voting";
        m.deadline = clock() + 30000;
      } else m.deadline = clock() + 20000;
      return;
    }
    if (m.phase === "voting") finish(r);
  }
  function view(id: string, i: MabarIdentity): RoomView {
    const r = roomCache.get(id) ?? get(id);
    access(r, i);
    const p = member(r, i.id),
      m = r.match;
    let match: MatchView | null = null;
    if (m) {
      const active = m.order.includes(i.id) && !p.spectator,
        index = active ? chainIndex(m, i.id) : 0;
      match = {
        id: m.id,
        mode: m.mode,
        phase: m.phase,
        stage: m.stage,
        total: m.total,
        deadline: m.deadline,
        prompt:
          m.mode === "quick" && m.phase !== "countdown"
            ? m.questions[Math.min(m.stage, m.questions.length - 1)].prompt
            : m.mode === "word"
              ? m.lastWord
              : "",
        submitted:
          m.locked.includes(i.id) || m.answers.some((a) => a.playerId === i.id),
        ...(m.mode === "semantic" && m.phase !== "countdown"
          ? {
              clues: published(m.stages[Math.min(m.stage, m.stages.length - 1)])
                .clues,
            }
          : {}),
        ...(m.mode === "word"
          ? { turn: m.order[m.stage % m.order.length] }
          : {}),
      };
      if (m.mode === "chain" && active && m.phase === "playing") {
        match.task = m.stage % 2 === 1 ? "drawing" : "text";
        match.previous = lastEntry(m, index);
        match.draft = m.drafts[i.id];
      }
      if (
        m.mode === "chain" &&
        ["gallery", "voting", "results"].includes(m.phase)
      ) {
        match.gallery = m.chains
          .slice(0, m.phase === "gallery" ? m.galleryIndex + 1 : undefined)
          .map((entries, n) => ({ owner: m.order[n], entries }));
        match.galleryIndex = m.galleryIndex;
        match.voted = i.id in m.votes;
      }
      if (m.phase === "reveal" || m.phase === "results")
        match.reveal = {
          answer:
            m.mode === "quick"
              ? m.questions[Math.min(m.stage, m.questions.length - 1)]
                  .answers[0]
              : m.mode === "semantic"
                ? published(m.stages[Math.min(m.stage, m.stages.length - 1)])
                    .best
                : m.lastWord,
          answers: m.phase === "results" ? m.history.flat() : m.answers,
        };
    }
    return {
      ...summary(r),
      revision: r.revision,
      serverTime: clock(),
      self: i.id,
      settings: r.settings,
      members: r.members.map((v) => ({
        ...v,
        host: v.id === r.host,
        online: v.disconnected === null,
        rank: 1 + r.members.filter((other) => other.score > v.score).length,
      })),
      match,
      messages: !m || m.phase === "results" ? r.messages : [],
      notice: r.notice,
    };
  }
  function command(id: string, i: MabarIdentity, raw: unknown) {
    const cmd = commandSchema.parse(raw);
    return sql
      .transaction(() => {
        const r = get(id);
        access(r, i);
        const p = member(r, i.id);
        if (
          sql
            .prepare(
              "SELECT 1 FROM mabar_commands WHERE room_id=? AND command_id=?",
            )
            .get(id, cmd.id)
        )
          return;
        limit("cmd:" + i.id, 120, 10000);
        const m = r.match;
        const host = () => {
          if (r.host !== i.id)
            throw new MabarError("Hanya host yang bisa melakukan ini.", 403);
        };
        const lobby = () => {
          if (m && m.phase !== "results")
            throw new MabarError("Tunggu pertandingan selesai.", 409);
        };
        if (
          ["answer", "draft", "submit", "vote", "gallery-next"].includes(
            cmd.type,
          )
        ) {
          if (!m || cmd.matchId !== m.id || cmd.stage !== m.stage)
            throw new MabarError("Tahap sudah berubah.", 409);
          if (m.deadline <= clock()) throw new MabarError("Waktu habis.", 409);
        }
        switch (cmd.type) {
          case "ready":
            lobby();
            p.spectator = false;
            p.ready = !p.ready;
            break;
          case "settings": {
            host();
            lobby();
            const next = settings(cmd.payload);
            if (next.capacity < r.members.length)
              throw new MabarError("Kapasitas lebih kecil dari jumlah pemain.");
            const { password: pw, ...opts } = next;
            r.settings = {
              ...opts,
              visibility: r.source === "discord" ? "unlisted" : opts.visibility,
            };
            if (pw !== undefined) r.password = pw ? password(pw) : null;
            for (const v of r.members) v.ready = false;
            break;
          }
          case "start":
            host();
            lobby();
            begin(r);
            break;
          case "lobby":
            host();
            lobby();
            r.match = null;
            for (const v of r.members) {
              v.spectator = false;
              v.ready = false;
            }
            break;
          case "kick":
          case "ban":
          case "host": {
            host();
            const target = z.string().parse(cmd.payload);
            if (target === i.id) throw new MabarError("Pilih pemain lain.");
            member(r, target);
            if (cmd.type === "host") r.host = target;
            else {
              r.members = r.members.filter((v) => v.id !== target);
              if (cmd.type === "ban") r.bans.push(target);
            }
            break;
          }
          case "chat":
            lobby();
            limit("chat:" + i.id, 20);
            r.messages.push({
              id: randomUUID(),
              playerId: i.id,
              text: z.string().trim().min(1).max(240).parse(cmd.payload),
            });
            r.messages = r.messages.slice(-50);
            break;
          case "answer": {
            if (
              !m ||
              m.phase !== "playing" ||
              p.spectator ||
              !m.order.includes(i.id)
            )
              throw new MabarError("Kamu sedang menonton.", 403);
            if (m.answers.some((a) => a.playerId === i.id))
              throw new MabarError("Jawaban sudah terkunci.", 409);
            const word = clean(
              z.string().trim().min(1).max(80).parse(cmd.payload),
            );
            let score = 0;
            let connections: number[] | undefined;
            if (m.mode === "quick") {
              limit("guess:" + i.id, 1, 1000);
              if (!m.questions[m.stage].answers.map(clean).includes(word)) {
                throw new MabarError("Belum tepat.");
              }
              const elapsed = Math.floor((clock() - m.started) / 100) * 100;
              score =
                1000 -
                Math.min(
                  500,
                  Math.floor((500 * elapsed) / (r.settings.seconds * 1000)),
                );
            } else if (m.mode === "semantic") {
              const stage = published(m.stages[m.stage]);
              const entry = Object.hasOwn(stage.scores, word)
                ? stage.scores[word]
                : undefined;
              if (!entry) throw new MabarError("Kata belum ada di kamus.");
              score = entry.score;
              connections = entry.connections;
            } else if (m.mode === "word") {
              if (m.order[m.stage % m.order.length] !== i.id)
                throw new MabarError("Belum giliranmu.", 403);
              if (!/^[a-z]+$/.test(word) || !dictionary.has(word))
                throw new MabarError("Kata belum ada di kamus.");
              if (
                !word.startsWith(m.lastWord.slice(-1)) ||
                m.used.includes(word)
              )
                throw new MabarError(
                  "Huruf awal salah atau kata sudah dipakai.",
                );
              score = 100;
              m.used.push(word);
              m.lastWord = word;
              const tail = word.slice(-1);
              if (
                ![...dictionary].some(
                  (w) => w.startsWith(tail) && !m.used.includes(w),
                )
              ) {
                m.lastWord = "rumah";
                if (m.used.includes("rumah"))
                  m.lastWord = [...dictionary].find(
                    (w) => !m.used.includes(w),
                  )!;
                m.used.push(m.lastWord);
              }
            } else throw new MabarError("Mode tidak menerima jawaban ini.");
            m.answers.push({ playerId: i.id, word, score, connections });
            if (m.mode === "word") completeStage(r);
            break;
          }
          case "draft":
          case "submit": {
            if (
              !m ||
              m.mode !== "chain" ||
              m.phase !== "playing" ||
              p.spectator ||
              !m.order.includes(i.id)
            )
              throw new MabarError("Tidak ada tugas gambar.", 403);
            if (m.locked.includes(i.id))
              throw new MabarError("Tugas sudah dikunci.", 409);
            if (cmd.type === "draft") limit("draft:" + i.id, 1, 1000);
            const input = z
              .object({
                text: z.string().max(100).optional(),
                drawing: drawingSchema.optional(),
              })
              .parse(cmd.payload);
            const entry: ChainEntry =
              m.stage % 2 === 1
                ? { playerId: i.id, drawing: input.drawing ?? [] }
                : { playerId: i.id, text: input.text?.trim() ?? "" };
            m.drafts[i.id] = entry;
            if (cmd.type === "submit") m.locked.push(i.id);
            break;
          }
          case "gallery-next":
            host();
            if (m?.phase !== "gallery")
              throw new MabarError("Galeri belum dibuka.");
            advance(r);
            break;
          case "vote": {
            if (
              !m ||
              m.phase !== "voting" ||
              p.spectator ||
              !m.order.includes(i.id)
            )
              throw new MabarError("Voting belum tersedia.", 403);
            if (i.id in m.votes)
              throw new MabarError("Suara sudah dikunci.", 409);
            const vote = z
              .number()
              .int()
              .min(-1)
              .max(m.order.length - 1)
              .parse(cmd.payload);
            if (m.order[vote] === i.id)
              throw new MabarError("Pilih rantai pemain lain.");
            m.votes[i.id] = vote;
            break;
          }
        }
        sql
          .prepare("INSERT INTO mabar_commands(room_id,command_id) VALUES(?,?)")
          .run(id, cmd.id);
        save(r);
        if (cmd.type !== "draft") emit(r);
      })
      .immediate();
  }
  // A process restart invalidates active timers without awarding a winner.
  for (const row of rows()) {
    const r = JSON.parse(row.state) as Room;
    if (r.match && r.match.phase !== "results") {
      r.match = null;
      r.notice =
        "Server tersambung kembali. Pertandingan dibatalkan; silakan mulai lagi.";
    }
    for (const p of r.members) {
      p.disconnected = clock();
      p.ready = false;
    }
    save(r);
  }
  function tick() {
    for (const row of rows()) {
      const r = JSON.parse(row.state) as Room;
      let changed = false;
      for (const p of r.members) {
        if (p.disconnected === null && clock() - p.seen >= 45000) {
          p.disconnected = p.seen;
          changed = true;
        }
      }
      const host = r.members.find((p) => p.id === r.host);
      if (
        host &&
        host.disconnected !== null &&
        clock() - host.disconnected >= 60000
      ) {
        const next = r.members.find((p) => p.disconnected === null);
        if (next && next.id !== r.host) {
          r.host = next.id;
          changed = true;
        }
      }
      if (r.members.every((p) => p.disconnected !== null)) {
        if (r.emptySince === null) {
          r.emptySince = clock();
          changed = true;
        }
        if (r.source === "web" && clock() - r.emptySince >= 900000) {
          sql.prepare("DELETE FROM mabar_matches WHERE room_id=?").run(r.id);
          sql.prepare("DELETE FROM mabar_rooms WHERE id=?").run(r.id);
          roomCache.delete(r.id);
          for (const cb of listeners) cb(r.id);
          continue;
        }
      } else if (r.emptySince !== null) {
        r.emptySince = null;
        changed = true;
      }
      const m = r.match;
      if (
        m &&
        m.phase !== "results" &&
        (clock() >= m.deadline ||
          (m.phase === "playing" &&
            clock() - m.started >= 3000 &&
            m.mode === "chain" &&
            m.locked.length === m.order.length))
      ) {
        advance(r);
        changed = true;
      }
      if (changed) {
        save(r);
        emit(r);
      }
    }
    for (const [key, v] of tickets) if (v.until <= clock()) tickets.delete(key);
  }
  function touch(id: string, i: MabarIdentity, disconnected = false) {
    const r = get(id);
    access(r, i);
    const p = member(r, i.id),
      changed = (p.disconnected !== null) !== disconnected;
    p.disconnected = disconnected ? clock() : null;
    p.seen = clock();
    save(r);
    if (changed) emit(r);
  }
  function ticket(id: string, i: MabarIdentity) {
    view(id, i);
    limit("ticket:" + i.id, 30);
    const value = randomBytes(32).toString("hex");
    tickets.set(value, { room: id, identity: i, until: clock() + 30000 });
    return value;
  }
  function redeem(value: string) {
    const t = tickets.get(value);
    tickets.delete(value);
    if (!t || t.until <= clock())
      throw new MabarError("Koneksi kedaluwarsa.", 401);
    view(t.room, t.identity);
    return t;
  }
  function report(channelId: string, guildId: string) {
    const found = rows()
      .map((row) => JSON.parse(row.state) as Room)
      .filter(
        (r) =>
          r.source === "discord" &&
          r.channelId === channelId &&
          r.guildId === guildId &&
          r.members.some(
            (p) => p.disconnected === null && clock() - p.seen < 90000,
          ),
      )
      .sort((a, b) => b.revision - a.revision)[0];
    if (!found) return null;
    return {
      name: found.settings.name,
      mode: found.settings.mode,
      phase: found.match?.phase ?? "lobby",
      stage: found.match?.stage ?? 0,
      total: found.match?.total ?? 0,
      players: found.members.map((p) => {
        const identity = sql
          .prepare(
            "SELECT discord_id,avatar FROM discord_identities WHERE discord_id=?",
          )
          .get(p.id) as
          | { discord_id: string; avatar: string | null }
          | undefined;
        return {
          id: identity?.discord_id ?? p.id,
          name: p.name,
          avatar: identity?.avatar ?? null,
          score: found.match?.phase === "results" ? p.score : null,
        };
      }),
      guildId,
      channelId,
    };
  }
  async function reapDiscord(alive: (instanceId: string) => Promise<boolean>) {
    for (const row of rows()) {
      const r = JSON.parse(row.state) as Room;
      if (
        r.source !== "discord" ||
        r.emptySince === null ||
        clock() - r.emptySince < 60000
      )
        continue;
      if (await alive(r.discordKey!.split(":")[1])) continue;
      const fresh = get(r.id);
      if (fresh.members.some((p) => p.disconnected === null)) continue;
      sql
        .transaction(() => {
          sql.prepare("DELETE FROM mabar_matches WHERE room_id=?").run(r.id);
          sql.prepare("DELETE FROM mabar_rooms WHERE id=?").run(r.id);
        })
        .immediate();
      roomCache.delete(r.id);
      emit(r);
    }
  }
  return {
    reapDiscord,
    report,
    profile,
    updateProfile,
    avatar,
    list,
    create,
    join,
    leave,
    view,
    command,
    tick,
    touch,
    ticket,
    redeem,
    subscribe(cb: (id: string) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    limit,
  };
}
export type MabarService = ReturnType<typeof createMabar>;

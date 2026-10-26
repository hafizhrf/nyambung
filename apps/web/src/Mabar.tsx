import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  modeLabels,
  type RoomSettings,
  type RoomSummary,
  type RoomView,
  type GuestProfile,
  type MabarCommand,
  type MabarEvent,
  type MatchView,
  type ChainEntry,
  type Stroke,
} from "@nyambung/shared";
import { ArcadeSelect } from "./ArcadeSelect";
import { api, apiBase, uploadAvatar } from "./api";
import { platform } from "./platform";
import { MabarCanvas, DrawingPreview } from "./MabarCanvas";
import { createMabarImage } from "./mabarImage";
import { downloadImage } from "./shareImage";
const defaults: Record<RoomSettings["mode"], [number, number]> = {
  quick: [10, 20],
  word: [3, 10],
  chain: [1, 30],
};
const initial: RoomSettings = {
  name: "Room Nyambung",
  visibility: "public",
  capacity: 8,
  mode: "quick",
  rounds: 10,
  seconds: 20,
  pace: "normal",
};
const phaseLabels: Record<MatchView["phase"], string> = {
  countdown: "Bersiap",
  playing: "Bermain",
  reveal: "Hasil babak",
  gallery: "Galeri",
  voting: "Voting",
  results: "Selesai",
};
/** How-to-play copy shown in the lobby and while creating a room. */
const modeGuides: Record<
  RoomSettings["mode"],
  { summary: string; rules: string[] }
> = {
  quick: {
    summary: "Soal acak seperti Mode Acak. Adu nyambung sekaligus adu cepat.",
    rules: [
      "Tiap babak muncul soal acak: dua kata, tiga kata, atau dekat makna.",
      "Ketik satu kata yang paling nyambung dengan semua petunjuk, lalu kirim.",
      "Satu jawaban per babak. Kata yang belum ada di kamus boleh diganti.",
      "Skor makna 0-1.000. Makin lama menjawab, skor turun sampai separuhnya.",
      "Babak selesai saat waktu habis atau semua sudah menjawab. Total skor tertinggi menang.",
    ],
  },
  word: {
    summary: "Sambung kata sistem gugur. Bertahan sampai jadi yang terakhir.",
    rules: [
      "Pemain bergiliran sesuai urutan acak, dimulai dari kata RUMAH.",
      "Kata harus diawali huruf terakhir kata sebelumnya dan ada di kamus.",
      "Kata yang sudah dipakai di permainan ini tidak boleh dipakai lagi.",
      "Kehabisan waktu saat giliranmu berarti gugur.",
      "Waktu giliran berkurang 1 detik tiap putaran, minimal 5 detik. Pemain terakhir menang.",
    ],
  },
  chain: {
    summary: "Tulis, gambar, lalu tebak secara berantai.",
    rules: [
      "Semua pemain menulis kata atau frasa rahasia.",
      "Rantai bergeser: gambar tulisan yang kamu terima, lalu tebak gambar berikutnya, bergantian.",
      "Kunci jawaban sebelum waktu habis. Tugas yang kosong dilewati.",
      "Di akhir, lihat galeri tiap rantai dan pilih rantai favorit selain milikmu.",
      "Rantai dengan suara terbanyak menang.",
    ],
  },
};
const kindLabels = {
  bridge2: ["Dua kata", "Cari satu kata yang nyambung dengan kedua petunjuk."],
  bridge3: ["Tiga kata", "Cari satu kata yang nyambung dengan ketiga petunjuk."],
  closest: ["Dekat makna", "Cari kata yang paling dekat maknanya."],
} as const;
const paceLabels: Record<RoomSettings["pace"], string> = {
  fast: "cepat",
  normal: "normal",
  relaxed: "santai",
};
const browserTabs = [
  ["browse", "Daftar room"],
  ["create", "Buat room"],
  ["code", "Pakai kode"],
] as const;
type BrowserTab = (typeof browserTabs)[number][0];
function describe(s: RoomView["settings"]) {
  return s.mode === "chain"
    ? `Tempo ${paceLabels[s.pace]}`
    : s.mode === "word"
      ? `Sistem gugur · ${s.seconds} dtk`
      : `${s.rounds} babak · ${s.seconds} dtk`;
}
/** Short facts for the lobby tiles. */
function facts(s: RoomView["settings"]): [string, string][] {
  if (s.mode === "chain") {
    const [write, draw] = { fast: [20, 40], normal: [30, 60], relaxed: [45, 90] }[
      s.pace
    ];
    return [
      ["Tulis", `${write} dtk`],
      ["Gambar", `${draw} dtk`],
      ["Minimal", "3 pemain"],
    ];
  }
  if (s.mode === "word")
    return [
      ["Waktu awal", `${s.seconds} dtk`],
      ["Waktu minimal", `${Math.min(5, s.seconds)} dtk`],
      ["Sistem", "Gugur"],
    ];
  return [
    ["Babak", String(s.rounds)],
    ["Waktu", `${s.seconds} dtk`],
    ["Skor maks", "1.000"],
  ];
}
function localRead(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localWrite(key: string, value: string | null) {
  try {
    value === null
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, value);
  } catch {
    /* Storage is optional. */
  }
}
function Avatar({ p }: { p: GuestProfile }) {
  return p.avatar ? (
    <img
      src={
        p.avatar.startsWith("/api/")
          ? p.avatar.replace("/api", apiBase())
          : p.avatar
      }
      alt=""
      className="mabar-avatar"
    />
  ) : (
    <span className="mabar-avatar pixel-avatar" aria-hidden="true">
      {[...p.name][0]}
    </span>
  );
}
/** Framed cabinet panel; the title sits on the top border. */
function Panel({
  title,
  className = "",
  children,
}: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`mabar-panel ${className}`}>
      <h2 className="mabar-panel-title">{title}</h2>
      {children}
    </section>
  );
}
function Presets({
  value,
  change,
}: {
  value: RoomSettings;
  change: (v: RoomSettings) => void;
}) {
  const mode = value.mode;
  return (
    <>
      <label className="span-2">
        Nama room
        <input
          maxLength={40}
          value={value.name}
          onChange={(e) => change({ ...value, name: e.target.value })}
        />
      </label>
      <label>
        Mode
        <ArcadeSelect
          label="Mode"
          value={mode}
          onValueChange={(selected) => {
            const mode = selected as RoomSettings["mode"];
            change({
              ...value,
              mode,
              capacity:
                mode === "chain" ? Math.max(3, value.capacity) : value.capacity,
              rounds: defaults[mode][0],
              seconds: defaults[mode][1],
            });
          }}
        >
          {Object.entries(modeLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </ArcadeSelect>
      </label>
      <label className="f-num">
        Kapasitas
        <ArcadeSelect
          label="Kapasitas"
          value={value.capacity}
          onValueChange={(selected) => change({ ...value, capacity: +selected })}
        >
          {Array.from(
            { length: mode === "chain" ? 10 : 11 },
            (_, n) => n + (mode === "chain" ? 3 : 2),
          ).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </ArcadeSelect>
      </label>
      {mode === "chain" ? (
        <label className="span-2 f-tempo">
          Tempo
          <ArcadeSelect
            label="Tempo"
            value={value.pace}
            onValueChange={(selected) =>
              change({ ...value, pace: selected as RoomSettings["pace"] })
            }
          >
            <option value="fast">Cepat · 20/40 dtk</option>
            <option value="normal">Normal · 30/60 dtk</option>
            <option value="relaxed">Santai · 45/90 dtk</option>
          </ArcadeSelect>
        </label>
      ) : (
        <>
          {mode === "quick" && (
            <label className="f-num">
              Babak
              <ArcadeSelect
                label="Babak"
                value={value.rounds}
                onValueChange={(selected) =>
                  change({ ...value, rounds: +selected })
                }
              >
                {[5, 10, 15].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </ArcadeSelect>
            </label>
          )}
          <label className="f-num">
            {mode === "word" ? "Waktu awal" : "Detik"}
            <ArcadeSelect
              label={mode === "word" ? "Waktu awal" : "Detik"}
              value={value.seconds}
              onValueChange={(selected) => change({ ...value, seconds: +selected })}
            >
              {(mode === "quick" ? [15, 20, 30] : [7, 10, 15]).map((n) => (
                <option key={n} value={n}>
                  {n} dtk
                </option>
              ))}
            </ArcadeSelect>
          </label>
        </>
      )}
      {platform.kind === "browser" && (
        <>
          <label>
            Visibilitas
            <ArcadeSelect
              label="Visibilitas"
              value={value.visibility}
              onValueChange={(selected) =>
                change({
                  ...value,
                  visibility: selected as RoomSettings["visibility"],
                })
              }
            >
              <option value="public">Publik</option>
              <option value="unlisted">Tidak terdaftar</option>
            </ArcadeSelect>
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Opsional"
              minLength={4}
              maxLength={64}
              value={value.password ?? ""}
              onChange={(e) => change({ ...value, password: e.target.value })}
            />
          </label>
        </>
      )}
      <p className="mabar-hint span-2">{modeGuides[mode].summary}</p>
    </>
  );
}
export function MabarMini({ room }: { room: RoomView | null }) {
  const received = useRef(Date.now());
  useEffect(() => {
    received.current = Date.now();
  }, [room?.serverTime]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="mabar-mini">
      <strong>NYAMBUNG</strong>
      <span>{room ? modeLabels[room.mode] : "Mabar"}</span>
      <b>
        {!room?.match
          ? "Lobby"
          : room.match.mode === "word"
            ? `Putaran ${room.match.round ?? 1}`
            : `${Math.min(room.match.stage + 1, room.match.total)}/${room.match.total}`}
      </b>
      <span>
        {room?.match?.deadline
          ? `${Math.max(0, Math.ceil((room.match.deadline - room.serverTime - (now - received.current)) / 1000))} dtk`
          : `${room?.count ?? 0} pemain`}
      </span>
      <small>Buka Activity untuk bermain</small>
    </section>
  );
}
export function Mabar({
  active,
  compact,
  onRoom,
}: {
  active: boolean;
  compact: boolean;
  onRoom: (r: RoomView | null) => void;
}) {
  const invite = new URLSearchParams(location.search).get("room");
  const [profile, setProfile] = useState<GuestProfile | null | undefined>(),
    [editingProfile, setEditingProfile] = useState(false),
    [name, setName] = useState(""),
    [room, setRoom] = useState<RoomView | null>(null),
    [rooms, setRooms] = useState<RoomSummary[]>([]),
    [settings, setSettings] = useState(initial),
    [tab, setTab] = useState<BrowserTab>("browse"),
    [editing, setEditing] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [joinCode, setJoinCode] = useState(
      () => invite ?? localRead("nyambung-mabar-room") ?? "",
    ),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Menghubungkan…"),
    [copied, setCopied] = useState(false),
    [input, setInput] = useState(""),
    [chat, setChat] = useState(""),
    [muted, setMuted] = useState<string[]>([]),
    [draft, setDraft] = useState<ChainEntry | undefined>(),
    [now, setNow] = useState(Date.now());
  const socket = useRef<WebSocket | null>(null),
    disconnect = useRef<(() => void) | null>(null),
    roomRef = useRef(room),
    pending = useRef(
      new Map<
        string,
        {
          resolve: () => void;
          reject: (e: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    ),
    offset = useRef(0),
    draftRef = useRef(draft),
    dirty = useRef(false),
    passwordField = useRef<HTMLInputElement>(null),
    chatLog = useRef<HTMLDivElement>(null);
  roomRef.current = room;
  draftRef.current = draft;
  const display = (r: RoomView) => {
    offset.current = r.serverTime - Date.now();
    setRoom(r);
    onRoom(r);
  };
  const displayNull = () => {
    setRoom(null);
    onRoom(null);
    localWrite("nyambung-mabar-room", null);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const send = (type: MabarCommand["type"], payload?: unknown) =>
    new Promise<void>((resolve, reject) => {
      const r = roomRef.current;
      if (!r || socket.current?.readyState !== WebSocket.OPEN) {
        reject(new Error("Koneksi belum siap."));
        return;
      }
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.current.delete(id);
        reject(new Error("Belum ada balasan. Periksa koneksi lalu coba lagi."));
      }, 10000);
      pending.current.set(id, { resolve, reject, timer });
      socket.current.send(
        JSON.stringify({
          id,
          type,
          payload,
          matchId: r.match?.id,
          stage: r.match?.stage,
        }),
      );
    });
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    void run(async () => {
      if (platform.kind === "discord") {
        display(await api<RoomView>("/mabar/discord", {}));
        return;
      }
      const p = await api<GuestProfile | null>("/mabar/profile");
      setProfile(p);
      if (p) {
        setName(p.name);
        if (joinCode)
          try {
            display(
              await api<RoomView>(
                `/mabar/rooms/${encodeURIComponent(joinCode)}/join`,
                { password: "" },
              ),
            );
          } catch {
            // An invite may need a password; a remembered room may be gone.
            if (invite) setTab("code");
            else {
              setJoinCode("");
              localWrite("nyambung-mabar-room", null);
            }
          }
      }
    });
  }, []);
  useEffect(() => {
    if (!profile || room || tab !== "browse" || platform.kind !== "browser")
      return;
    let stopped = false;
    const update = () =>
      api<RoomSummary[]>(
        `/mabar/rooms?q=${encodeURIComponent(query)}&mode=${filter}`,
      )
        .then((r) => {
          if (!stopped) setRooms(r);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    void update();
    const t = setInterval(() => void update(), 5000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [profile, room?.id, query, filter, tab]);
  useEffect(() => {
    if (tab === "code" && joinCode) passwordField.current?.focus();
  }, [tab]);
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    localWrite("nyambung-mabar-room", id);
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      attempt = 0,
      ws: WebSocket;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      if (socket.current === ws) socket.current = null;
    };
    disconnect.current = stop;
    const connect = async () => {
      try {
        setStatus("Menghubungkan…");
        const { ticket } = await api<{ ticket: string }>(
          `/mabar/rooms/${id}/ticket`,
          {},
        );
        if (stopped) return;
        const url = new URL(`${apiBase()}/mabar/ws`, location.href);
        url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        url.searchParams.set("ticket", ticket);
        ws = new WebSocket(url);
        socket.current = ws;
        ws.onopen = () => {
          attempt = 0;
          setStatus("Live");
        };
        ws.onmessage = (e) => {
          const event = JSON.parse(e.data) as MabarEvent;
          if (event.type === "snapshot") {
            display(event.room);
            return;
          }
          const job = event.id ? pending.current.get(event.id) : undefined;
          if (job) {
            clearTimeout(job.timer);
            pending.current.delete(event.id!);
            event.type === "ack"
              ? job.resolve()
              : job.reject(new Error(event.error));
          } else if (event.type === "error") setError(event.error);
        };
        ws.onclose = (e) => {
          for (const job of pending.current.values()) {
            clearTimeout(job.timer);
            job.reject(new Error("Koneksi terputus."));
          }
          pending.current.clear();
          if (stopped) return;
          if (e.code === 4003) {
            // Kicked, banned or the room closed: return to the lobby.
            stop();
            displayNull();
            setError("Room sudah ditutup atau kamu tidak lagi di room ini.");
            return;
          }
          if (e.code === 4001) {
            setStatus("Dibuka di perangkat lain");
            setError("Room ini sedang dibuka di tab atau perangkat lain.");
            return;
          }
          setStatus("Menyambungkan ulang…");
          timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** attempt++));
        };
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          timer = setTimeout(connect, Math.min(10000, 1000 * 2 ** attempt++));
        }
      }
    };
    void connect();
    return () => {
      stop();
      if (disconnect.current === stop) disconnect.current = null;
    };
  }, [room?.id]);
  const m = room?.match,
    self = room?.members.find((p) => p.id === room.self),
    lobby = !m || m.phase === "results";
  useEffect(() => {
    if (active) document.querySelector("main")?.scrollTo({ top: 0 });
  }, [m?.phase, m?.stage, active]);
  useEffect(() => {
    const log = chatLog.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [room?.messages.length, lobby]);
  const taskKey = m ? `nyambung-mabar-draft:${m.id}:${m.stage}` : "";
  useEffect(() => {
    setInput("");
    dirty.current = false;
    if (m?.task) {
      const saved = localRead(taskKey);
      let value = m.draft;
      try {
        if (saved) value = JSON.parse(saved);
      } catch {
        /* Ignore an invalid local draft. */
      }
      setDraft(value ?? { playerId: room!.self });
    } else setDraft(undefined);
  }, [taskKey, m?.task]);
  useEffect(() => {
    if (!m?.task || m.submitted) return;
    const timer = setInterval(() => {
      if (!dirty.current || !draftRef.current) return;
      dirty.current = false;
      void send("draft", draftRef.current).catch(() => {
        dirty.current = true;
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [taskKey, m?.task, m?.submitted]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const changeDraft = (value: ChainEntry) => {
    setDraft(value);
    dirty.current = true;
    localWrite(taskKey, JSON.stringify(value));
  };
  const time = m?.deadline
    ? Math.max(0, Math.ceil((m.deadline - now - offset.current) / 1000))
    : 0;
  const join = (id: string) =>
    run(async () => {
      const r = await api<RoomView>(
        `/mabar/rooms/${encodeURIComponent(id)}/join`,
        { password },
      );
      display(r);
      setPassword("");
      setTab("browse");
    });
  const leave = () =>
    run(async () => {
      // Close our socket first so the server's room-closed signal is not shown as an error.
      disconnect.current?.();
      if (room)
        try {
          await api(`/mabar/rooms/${room.id}/leave`, {});
        } catch {
          /* Always release the local controller when leaving an unavailable room. */
        }
      const url = new URL(location.href);
      if (url.searchParams.has("room")) {
        url.searchParams.delete("room");
        history.replaceState(history.state, "", url);
      }
      setJoinCode("");
      setEditing(false);
      displayNull();
    });
  const saveProfile = () =>
    run(async () => {
      setProfile(await api<GuestProfile>("/mabar/profile", { name }));
      setEditingProfile(false);
    });
  const players = room?.members.filter((p) => !p.spectator) ?? [],
    alive = players.filter((p) => !m?.eliminated?.includes(p.id)).length,
    minimum = room?.mode === "chain" ? 3 : 2,
    readyCount = players.filter((p) => p.ready).length,
    canStart =
      players.length >= minimum && players.every((p) => p.ready && p.online),
    lobbyHint =
      players.length < minimum
        ? `Butuh minimal ${minimum} pemain. Bagikan link room ke teman.`
        : canStart
          ? self?.host
            ? "Semua siap. Mulai permainan!"
            : "Semua siap. Menunggu host memulai."
          : `Menunggu pemain siap · ${readyCount}/${players.length}`;
  const memberName = (id?: string) =>
    room?.members.find((p) => p.id === id)?.name ?? "Pemain";
  return (
    <section className="mabar-page" hidden={!active} aria-label="Mabar">
      {room ? (
        <header className="mabar-heading">
          <div className="mabar-title">
            <span className="mabar-kicker">{modeLabels[room.mode]}</span>
            <h1>{room.name}</h1>
            <p className="room-meta">
              <span>{describe(room.settings)}</span>
              <span>
                {room.count}/{room.capacity} pemain
              </span>
              {room.locked && <span>Password</span>}
              {platform.kind === "browser" && (
                <span>
                  Kode <b>{room.id}</b>
                </span>
              )}
            </p>
          </div>
          <div className="room-actions">
            <span
              role="status"
              className="live-status"
              data-live={status === "Live" ? "on" : undefined}
            >
              {status}
            </span>
            {platform.kind === "discord" ? (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await platform.invite?.();
                  })
                }
              >
                Undang teman
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const url = new URL(location.href);
                    url.searchParams.set("room", room.id);
                    await navigator.clipboard.writeText(url.href);
                    setCopied(true);
                  })
                }
              >
                {copied ? "Link tersalin" : "Salin link"}
              </button>
            )}
            <button
              type="button"
              className="leave-button"
              disabled={busy}
              onClick={() => void leave()}
            >
              Keluar room
            </button>
          </div>
        </header>
      ) : (
        <header className="mabar-heading">
          <div className="mabar-title">
            <span className="mabar-kicker">Main bareng · real-time</span>
            <h1>Mabar</h1>
          </div>
          {platform.kind === "browser" && profile && !editingProfile && (
            <div className="profile-chip">
              <Avatar p={profile} />
              <span>
                <small>Main sebagai</small>
                {profile.name}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setName(profile.name);
                  setEditingProfile(true);
                }}
              >
                Ubah profil
              </button>
            </div>
          )}
        </header>
      )}
      {error && (
        <p role="alert" className="error-message mabar-error">
          {error}
        </p>
      )}
      {!room && platform.kind === "discord" && (
        <>
          {busy && <p role="status">Menyiapkan room…</p>}
          {error && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  display(await api<RoomView>("/mabar/discord", {}));
                })
              }
            >
              Coba lagi
            </button>
          )}
        </>
      )}
      {!room && platform.kind === "browser" && (
        <>
          {profile === undefined && (
            <p role="status" className="mabar-hint">
              Memuat profil…
            </p>
          )}
          {(profile === null || editingProfile) && (
            <Panel
              title={profile ? "Ubah profil" : "Profil guest"}
              className="mabar-profile"
            >
              <form
                className="profile-form"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveProfile();
                }}
              >
                {profile ? (
                  <Avatar p={profile} />
                ) : (
                  <span
                    className="mabar-avatar pixel-avatar"
                    aria-hidden="true"
                  >
                    {[...name.trim()][0] ?? "?"}
                  </span>
                )}
                <div className="profile-fields">
                  <label>
                    Nama guest
                    <input
                      value={name}
                      maxLength={24}
                      minLength={2}
                      required
                      placeholder="2-24 karakter"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <p className="mabar-hint">
                    Nama ini tampil di room, chat, dan papan skor mabar.
                  </p>
                </div>
                {profile ? (
                  <div className="photo-actions">
                    <span className="photo-label">Foto profil</span>
                    <div className="mabar-actions">
                      <label className="avatar-upload">
                        <span>Ganti foto</span>
                        <input
                          type="file"
                          aria-label="Foto"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void run(async () => {
                                setProfile(await uploadAvatar(file));
                              });
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {profile.avatar && (
                        <button
                          type="button"
                          onClick={() =>
                            void run(async () => {
                              setProfile(await uploadAvatar(null));
                            })
                          }
                        >
                          Hapus foto
                        </button>
                      )}
                      <span className="mabar-hint">
                        JPEG, PNG, WebP · maks 2 MB
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mabar-hint photo-actions">
                    Foto bisa ditambah setelah profil disimpan.
                  </p>
                )}
                <div className="mabar-actions form-actions">
                  {profile && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEditingProfile(false)}
                    >
                      Batal
                    </button>
                  )}
                  <button disabled={busy} className="primary-button">
                    Simpan profil
                  </button>
                </div>
              </form>
            </Panel>
          )}
          {profile && !editingProfile && (
            <div className="mabar-browser">
              <nav className="mabar-tabs" aria-label="Menu mabar">
                {browserTabs.map(([id, label], n) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={label}
                    aria-pressed={tab === id}
                    onClick={() => setTab(id)}
                  >
                    <span aria-hidden="true">0{n + 1}</span>
                    {label}
                  </button>
                ))}
              </nav>
              {tab === "browse" && (
                <section className="mabar-panel tab-panel" aria-label="Daftar room">
                  <div className="mabar-filters">
                    <label>
                      Cari room
                      <input
                        type="search"
                        placeholder="Nama room"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label>
                      Mode
                      <ArcadeSelect
                        label="Mode"
                        value={filter}
                        onValueChange={(selected) => setFilter(selected)}
                      >
                        <option value="">Semua mode</option>
                        {Object.entries(modeLabels).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </ArcadeSelect>
                    </label>
                  </div>
                  {!rooms.length ? (
                    <div className="room-empty">
                      <p>
                        {query || filter
                          ? "Tidak ada room yang cocok."
                          : "Belum ada room publik."}
                      </p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setTab("create")}
                      >
                        Buat room baru
                      </button>
                    </div>
                  ) : (
                    <ul className="room-list">
                      <li className="room-list-head" aria-hidden="true">
                        <span>Room</span>
                        <span>Mode</span>
                        <span>Pemain</span>
                        <span>Status</span>
                      </li>
                      {rooms.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className="room-list-row"
                            disabled={busy}
                            onClick={() => {
                              setJoinCode(r.id);
                              if (!r.locked) void join(r.id);
                              else {
                                setPassword("");
                                setTab("code");
                              }
                            }}
                          >
                            <strong>{r.name}</strong>
                            <span className="room-mode">
                              {modeLabels[r.mode]}
                            </span>
                            <span className="room-count">
                              {r.count}/{r.capacity}
                            </span>
                            <span className="room-phase" data-phase={r.phase}>
                              {r.phase === "lobby"
                                ? "Lobby"
                                : r.phase === "results"
                                  ? "Rekap"
                                  : "Bermain"}
                              {r.locked ? " · Password" : ""}
                            </span>
                            <span className="room-join" aria-hidden="true">
                              Masuk ›
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {tab === "create" && (
                <form
                  className="mabar-panel tab-panel mabar-settings"
                  aria-label="Buat room"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      display(await api<RoomView>("/mabar/rooms", settings));
                      setTab("browse");
                    });
                  }}
                >
                  <Presets value={settings} change={setSettings} />
                  <div className="mabar-actions form-actions span-2">
                    <button className="primary-button" disabled={busy}>
                      Buat dan masuk
                    </button>
                  </div>
                </form>
              )}
              {tab === "code" && (
                <form
                  className="mabar-panel tab-panel"
                  aria-label="Pakai kode"
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void join(joinCode);
                  }}
                >
                  <div className="mabar-join">
                    <label>
                      Kode room
                      <input
                        name="room-code"
                        autoComplete="off"
                        placeholder="12 karakter"
                        value={joinCode}
                        maxLength={12}
                        pattern="[a-f0-9]{12}"
                        required
                        onChange={(e) => setJoinCode(e.target.value.trim())}
                      />
                    </label>
                    <label>
                      Password room
                      <input
                        ref={passwordField}
                        type="password"
                        name="room-password"
                        autoComplete="new-password"
                        placeholder="Opsional"
                        value={password}
                        maxLength={64}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <button className="primary-button" disabled={busy}>
                      Masuk
                    </button>
                  </div>
                  <p className="mabar-hint">
                    Minta kode atau link dari host. Password hanya untuk room
                    yang terkunci.
                  </p>
                </form>
              )}
            </div>
          )}
        </>
      )}
      {room && (
        <>
          {room.notice && (
            <p role="status" className="mabar-notice">
              {room.notice}
            </p>
          )}
          <div className="mabar-columns">
            <Panel
              title={
                !m
                  ? "Lobby"
                  : m.phase === "results"
                    ? "Selesai"
                    : m.mode === "word"
                      ? m.phase === "countdown"
                        ? "Bersiap"
                        : `Putaran ${m.round ?? 1} · ${alive}/${players.length} bertahan`
                      : `${phaseLabels[m.phase]} · ${Math.min(m.stage + 1, m.total)}/${m.total}`
              }
              className="mabar-arena"
            >
              {m && m.phase !== "results" && m.deadline > 0 && (
                <span
                  className="arena-timer"
                  data-urgent={time <= 5 ? "on" : undefined}
                >
                  {time} dtk
                </span>
              )}
              {lobby && editing && self?.host && (
                <form
                  className="mabar-settings"
                  aria-label="Atur room"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await send("settings", settings);
                      setEditing(false);
                    });
                  }}
                >
                  <Presets value={settings} change={setSettings} />
                  {platform.kind === "browser" && room.locked && (
                    <div className="mabar-actions span-2">
                      <button
                        type="button"
                        aria-pressed={settings.password === ""}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            password:
                              settings.password === "" ? undefined : "",
                          })
                        }
                      >
                        Hapus password
                      </button>
                      <span className="mabar-hint">
                        Kosongkan password untuk mempertahankan yang lama.
                      </span>
                    </div>
                  )}
                  <div className="mabar-actions form-actions span-2">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEditing(false)}
                    >
                      Batal
                    </button>
                    <button className="primary-button" disabled={busy}>
                      Simpan pengaturan
                    </button>
                  </div>
                </form>
              )}
              {lobby && !(editing && self?.host) && (
                <>
                  {m?.phase === "results" && (
                    <div className="mabar-results">
                      <h3>Hasil mabar</h3>
                      <ol className="mabar-podium">
                        {[...room.members]
                          .filter((p) => !p.spectator)
                          .sort((a, b) => b.score - a.score)
                          .map((p) => (
                            <li key={p.id} data-rank={p.rank}>
                              <span className="podium-rank">#{p.rank}</span>
                              <Avatar p={p} />
                              <span>{p.name}</span>
                              <b>{p.score}</b>
                            </li>
                          ))}
                      </ol>
                      <div className="mabar-actions">
                        <button
                          type="button"
                          onClick={() =>
                            void run(async () =>
                              downloadImage(await createMabarImage(room)),
                            )
                          }
                        >
                          Simpan gambar
                        </button>
                        {self?.host && (
                          <button
                            type="button"
                            onClick={() => void run(() => send("lobby"))}
                          >
                            Main lagi
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="lobby-state">
                    {!m && (
                      <section
                        className="mode-guide"
                        aria-label={`Cara main ${modeLabels[room.mode]}`}
                      >
                        <h3>Cara main</h3>
                        <p className="lobby-mode">
                          {modeGuides[room.mode].summary}
                        </p>
                        <ol className="guide-rules">
                          {modeGuides[room.mode].rules.map((rule, n) => (
                            <li key={n}>
                              <span aria-hidden="true">
                                {String(n + 1).padStart(2, "0")}
                              </span>
                              {rule}
                            </li>
                          ))}
                        </ol>
                        <dl className="guide-facts">
                          {facts(room.settings).map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    )}
                    <div className="ready-row">
                      <div className="ready-meter" aria-hidden="true">
                        {players.map((p) => (
                          <span
                            key={p.id}
                            data-ready={p.ready ? "on" : undefined}
                          />
                        ))}
                      </div>
                      <p className="lobby-hint">{lobbyHint}</p>
                    </div>
                    <div className="mabar-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        aria-pressed={self?.ready}
                        disabled={busy}
                        onClick={() => void run(() => send("ready"))}
                      >
                        {self?.ready ? "Batal siap" : "Siap"}
                      </button>
                      {self?.host && (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={busy || !canStart}
                          onClick={() => void run(() => send("start"))}
                        >
                          Mulai
                        </button>
                      )}
                      {self?.host && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setSettings({ ...room.settings });
                            setEditing(true);
                          }}
                        >
                          Atur room
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
              {m?.phase === "countdown" && (
                <div className="arena-center">
                  <span className="arena-label">Bersiap</span>
                  <strong className="countdown">{time}</strong>
                </div>
              )}
              {m?.phase === "playing" && (
                <>
                  {m.mode === "quick" && m.kind && (
                    <div className="round-card">
                      <span className="arena-label">{kindLabels[m.kind][0]}</span>
                      <div className="clue-chips">
                        {m.clues?.map((clue, n) => (
                          <strong
                            key={clue}
                            data-tone={n % 2 ? "purple" : "green"}
                          >
                            {clue}
                          </strong>
                        ))}
                      </div>
                      <p className="mabar-hint">{kindLabels[m.kind][1]}</p>
                    </div>
                  )}
                  {m.mode === "word" && (
                    <div className="round-card">
                      <span className="arena-label">Kata terakhir</span>
                      <strong className="chain-word">{m.prompt}</strong>
                      <p className="word-next">
                        Berikutnya diawali huruf{" "}
                        <b>{m.prompt.slice(-1).toUpperCase()}</b>
                      </p>
                      <p
                        className="turn-banner"
                        data-self={m.turn === room.self ? "on" : undefined}
                      >
                        {m.turn === room.self
                          ? "Giliranmu!"
                          : `Giliran ${memberName(m.turn)}`}
                      </p>
                    </div>
                  )}
                  {m.mode === "chain" && (
                    <h3 className="mabar-prompt">
                      {m.task === "drawing"
                        ? "Gambar dari kata ini"
                        : "Tulis kata atau tebak gambar"}
                    </h3>
                  )}
                  {self?.spectator ? (
                    <p className="arena-note">
                      Menonton · ikut pertandingan berikutnya
                    </p>
                  ) : m.mode === "chain" ? (
                    <>
                      {m.previous?.text && (
                        <p className="chain-word">{m.previous.text}</p>
                      )}
                      {m.previous?.drawing && (
                        <DrawingPreview strokes={m.previous.drawing} />
                      )}
                      {m.submitted ? (
                        <p className="arena-note">
                          Terkunci · menunggu pemain lain
                        </p>
                      ) : (
                        <div className="chain-task">
                          {m.task === "drawing" && active && !compact ? (
                            <MabarCanvas
                              value={draft?.drawing ?? []}
                              onChange={(drawing: Stroke[]) =>
                                changeDraft({ playerId: room.self, drawing })
                              }
                            />
                          ) : m.task === "text" ? (
                            <label>
                              {m.stage === 0 ? "Kata atau frasa" : "Tebakan"}
                              <input
                                value={draft?.text ?? ""}
                                maxLength={100}
                                onChange={(e) =>
                                  changeDraft({
                                    playerId: room.self,
                                    text: e.target.value,
                                  })
                                }
                              />
                            </label>
                          ) : null}
                          <div className="mabar-actions">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await send("submit", draft ?? {});
                                  localWrite(taskKey, null);
                                })
                              }
                            >
                              Kunci
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : m.mode === "word" && m.eliminated?.includes(room.self) ? (
                    <p className="arena-note">
                      Kamu gugur. Tonton sampai ada pemenang.
                    </p>
                  ) : m.mode === "word" && m.turn !== room.self ? (
                    <p className="arena-note">
                      Tunggu giliranmu. Siapkan kata berawalan{" "}
                      {m.prompt.slice(-1).toUpperCase()}.
                    </p>
                  ) : m.submitted ? (
                    <p className="arena-note">
                      Jawaban terkunci · menunggu pemain lain
                    </p>
                  ) : (
                    <form
                      className="mabar-answer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await send("answer", input);
                          setInput("");
                        });
                      }}
                    >
                      <label>
                        {m.mode === "word"
                          ? `Kata berawalan ${m.prompt.slice(-1).toUpperCase()}`
                          : "Jawaban"}
                        <input
                          aria-label="Jawaban mabar"
                          autoComplete="off"
                          autoFocus
                          maxLength={80}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                        />
                      </label>
                      <button
                        className="primary-button"
                        disabled={busy || !input.trim()}
                      >
                        Kirim
                      </button>
                    </form>
                  )}
                  {m.mode === "word" && !!m.used?.length && (
                    <div className="used-words">
                      <span className="arena-label">Kata terpakai</span>
                      <p>{m.used.join(" › ")}</p>
                    </div>
                  )}
                </>
              )}
              {m?.phase === "reveal" &&
                (m.mode === "word" ? (
                  <div className="arena-center">
                    <span className="arena-label">Waktu habis</span>
                    <strong className="reveal-answer eliminated">
                      {memberName(m.reveal?.eliminated)} gugur
                    </strong>
                    <p className="mabar-hint">
                      {alive} pemain masih bertahan
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="arena-center">
                      {m.kind && (
                        <div className="clue-chips small">
                          {m.clues?.map((clue, n) => (
                            <strong
                              key={clue}
                              data-tone={n % 2 ? "purple" : "green"}
                            >
                              {clue}
                            </strong>
                          ))}
                        </div>
                      )}
                      <span className="arena-label">Jawaban terbaik</span>
                      <strong className="reveal-answer">
                        {m.reveal?.answer}
                      </strong>
                      {m.reveal?.explanation && (
                        <p className="reveal-explanation">
                          {m.reveal.explanation}
                        </p>
                      )}
                    </div>
                    <ul className="reveal-list">
                      {[...(m.reveal?.answers ?? [])]
                        .sort((a, b) => b.score - a.score)
                        .map((a) => (
                          <li key={a.playerId}>
                            <span>{memberName(a.playerId)}</span>
                            <span className="reveal-word">
                              {a.word}
                              {a.quality !== undefined && (
                                <small>makna {a.quality}</small>
                              )}
                            </span>
                            <b>+{a.score}</b>
                          </li>
                        ))}
                      {!m.reveal?.answers.length && (
                        <li className="reveal-empty">
                          Belum ada yang menjawab babak ini.
                        </li>
                      )}
                    </ul>
                  </>
                ))}
              {m &&
                ["gallery", "voting", "results"].includes(m.phase) &&
                m.gallery && (
                  <div className="chain-gallery-list">
                    <h3>
                      {m.phase === "voting" ? "Pilih rantai favorit" : "Galeri"}
                    </h3>
                    {m.gallery.map((chain, n) => (
                      <article className="chain-gallery" key={chain.owner}>
                        <h4>
                          Rantai {n + 1} · {memberName(chain.owner)}
                        </h4>
                        {chain.entries.map((entry, index) => (
                          <div key={index}>
                            <small>{memberName(entry.playerId)}</small>
                            {entry.skipped ? (
                              <p>Dilewati</p>
                            ) : entry.drawing ? (
                              <DrawingPreview strokes={entry.drawing} />
                            ) : (
                              <p>{entry.text}</p>
                            )}
                          </div>
                        ))}
                        {m.phase === "voting" &&
                          !m.voted &&
                          !self?.spectator &&
                          chain.owner !== room.self && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void run(() => send("vote", n))}
                            >
                              Pilih rantai {n + 1}
                            </button>
                          )}
                      </article>
                    ))}
                    <div className="mabar-actions">
                      {m.phase === "gallery" && self?.host && (
                        <button
                          type="button"
                          onClick={() => void run(() => send("gallery-next"))}
                        >
                          Rantai berikutnya
                        </button>
                      )}
                      {m.phase === "voting" && !m.voted && !self?.spectator && (
                        <button
                          type="button"
                          onClick={() => void run(() => send("vote", -1))}
                        >
                          Abstain
                        </button>
                      )}
                    </div>
                  </div>
                )}
            </Panel>
            <div className="mabar-side">
              <Panel
                title={`Pemain ${room.count}/${room.capacity}`}
                className="mabar-players"
              >
                <ul className="player-list">
                  {room.members.map((p) => (
                    <li className="mabar-player" key={p.id}>
                      <Avatar p={p} />
                      <span className="player-name">
                        {p.name}
                        {p.id === room.self && <em> (kamu)</em>}
                        <small>
                          {p.host && <b className="tag-host">Host</b>}
                          {m?.mode === "word" &&
                            m.phase !== "results" &&
                            m.eliminated?.includes(p.id) && (
                              <b className="tag-out">Gugur</b>
                            )}
                          {m?.mode === "word" &&
                            m.phase === "playing" &&
                            m.turn === p.id && (
                              <b className="tag-turn">Giliran</b>
                            )}
                          <b
                            className={
                              p.spectator
                                ? "tag-muted"
                                : p.ready
                                  ? "tag-ready"
                                  : p.online
                                    ? "tag-online"
                                    : "tag-muted"
                            }
                          >
                            {p.spectator
                              ? "Menonton"
                              : p.ready
                                ? "Siap"
                                : p.online
                                  ? "Online"
                                  : "Terputus"}
                          </b>
                        </small>
                      </span>
                      <b className="player-score">{p.score}</b>
                      {p.id !== room.self && (
                        <details className="player-menu">
                          <summary aria-label={`Aksi untuk ${p.name}`}>
                            ···
                          </summary>
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                setMuted((v) =>
                                  v.includes(p.id)
                                    ? v.filter((id) => id !== p.id)
                                    : [...v, p.id],
                                )
                              }
                            >
                              {muted.includes(p.id) ? "Unmute" : "Mute"}
                            </button>
                            {self?.host &&
                              (["host", "kick", "ban"] as const).map((type) => (
                                <button
                                  type="button"
                                  key={type}
                                  onClick={() =>
                                    void run(() => send(type, p.id))
                                  }
                                >
                                  {
                                    {
                                      host: "Jadikan host",
                                      kick: "Keluarkan",
                                      ban: "Ban room",
                                    }[type]
                                  }
                                </button>
                              ))}
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
              {lobby && (
                <Panel title="Chat" className="mabar-chat">
                  <div role="log" ref={chatLog}>
                    {room.messages.filter((msg) => !muted.includes(msg.playerId))
                      .length ? (
                      room.messages
                        .filter((msg) => !muted.includes(msg.playerId))
                        .map((msg) => (
                          <p key={msg.id}>
                            <b>{memberName(msg.playerId)}</b> {msg.text}
                          </p>
                        ))
                    ) : (
                      <p className="mabar-hint">Belum ada pesan.</p>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await send("chat", chat);
                        setChat("");
                      });
                    }}
                  >
                    <input
                      aria-label="Pesan room"
                      placeholder="Tulis pesan"
                      autoComplete="off"
                      value={chat}
                      maxLength={240}
                      onChange={(e) => setChat(e.target.value)}
                    />
                    <button disabled={busy || !chat.trim()}>Kirim</button>
                  </form>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

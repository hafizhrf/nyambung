import { useEffect, useRef, useState } from "react";
import {
  modeLabels,
  type RoomSettings,
  type RoomSummary,
  type RoomView,
  type GuestProfile,
  type MabarCommand,
  type MabarEvent,
  type ChainEntry,
  type Stroke,
} from "@nyambung/shared";
import { api, apiBase, uploadAvatar } from "./api";
import { platform } from "./platform";
import { MabarCanvas, DrawingPreview } from "./MabarCanvas";
import { createMabarImage } from "./mabarImage";
import { downloadImage } from "./shareImage";
const defaults: Record<RoomSettings["mode"], [number, number]> = {
  quick: [10, 20],
  semantic: [5, 30],
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
      <label>
        Nama room
        <input
          maxLength={40}
          value={value.name}
          onChange={(e) => change({ ...value, name: e.target.value })}
        />
      </label>
      <label>
        Mode
        <select
          value={mode}
          onChange={(e) => {
            const mode = e.target.value as RoomSettings["mode"];
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
        </select>
      </label>
      <label>
        Kapasitas
        <select
          value={value.capacity}
          onChange={(e) => change({ ...value, capacity: +e.target.value })}
        >
          {Array.from(
            { length: mode === "chain" ? 10 : 11 },
            (_, n) => n + (mode === "chain" ? 3 : 2),
          ).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {mode === "chain" ? (
        <label>
          Tempo
          <select
            value={value.pace}
            onChange={(e) =>
              change({ ...value, pace: e.target.value as RoomSettings["pace"] })
            }
          >
            <option value="fast">Cepat · 20/40 dtk</option>
            <option value="normal">Normal · 30/60 dtk</option>
            <option value="relaxed">Santai · 45/90 dtk</option>
          </select>
        </label>
      ) : (
        <>
          <label>
            {mode === "word" ? "Putaran" : "Babak"}
            <select
              value={value.rounds}
              onChange={(e) => change({ ...value, rounds: +e.target.value })}
            >
              {(mode === "quick"
                ? [5, 10, 15]
                : mode === "semantic"
                  ? [5, 10]
                  : [3, 5, 7]
              ).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Detik
            <select
              value={value.seconds}
              onChange={(e) => change({ ...value, seconds: +e.target.value })}
            >
              {(mode === "quick"
                ? [15, 20, 30]
                : mode === "semantic"
                  ? [20, 30, 45]
                  : [7, 10, 15]
              ).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {platform.kind === "browser" && (
        <>
          <label>
            Daftar room
            <select
              value={value.visibility}
              onChange={(e) =>
                change({
                  ...value,
                  visibility: e.target.value as RoomSettings["visibility"],
                })
              }
            >
              <option value="public">Publik</option>
              <option value="unlisted">Tidak terdaftar</option>
            </select>
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              minLength={4}
              maxLength={64}
              value={value.password ?? ""}
              onChange={(e) => change({ ...value, password: e.target.value })}
            />
          </label>
        </>
      )}
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
        {room?.match
          ? `${Math.min(room.match.stage + 1, room.match.total)}/${room.match.total}`
          : "Lobby"}
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
  const [profile, setProfile] = useState<GuestProfile | null>(null),
    [name, setName] = useState(""),
    [room, setRoom] = useState<RoomView | null>(null),
    [rooms, setRooms] = useState<RoomSummary[]>([]),
    [settings, setSettings] = useState(initial),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [joinCode, setJoinCode] = useState(
      () =>
        new URLSearchParams(location.search).get("room") ??
        localRead("nyambung-mabar-room") ??
        "",
    ),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Menghubungkan…"),
    [input, setInput] = useState(""),
    [chat, setChat] = useState(""),
    [muted, setMuted] = useState<string[]>([]),
    [draft, setDraft] = useState<ChainEntry | undefined>(),
    [now, setNow] = useState(Date.now());
  const socket = useRef<WebSocket | null>(null),
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
    dirty = useRef(false);
  roomRef.current = room;
  draftRef.current = draft;
  const display = (r: RoomView) => {
    offset.current = r.serverTime - Date.now();
    setRoom(r);
    onRoom(r);
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
            /* Explicit join supports password and expired rooms. */
          }
      }
    });
  }, []);
  useEffect(() => {
    if (!profile || room || platform.kind !== "browser") return;
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
  }, [profile, room?.id, query, filter]);
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    localWrite("nyambung-mabar-room", id);
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      attempt = 0,
      ws: WebSocket;
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
          if ([4001, 4003].includes(e.code)) {
            setStatus(
              e.code === 4001
                ? "Dibuka di perangkat lain"
                : "Room tidak tersedia",
            );
            setError("Masuk kembali untuk melanjutkan.");
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
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      if (socket.current === ws) socket.current = null;
    };
  }, [room?.id]);
  const m = room?.match,
    self = room?.members.find((p) => p.id === room.self),
    lobby = !m || m.phase === "results";
  useEffect(() => {
    if (active) document.querySelector("main")?.scrollTo({ top: 0 });
  }, [m?.phase, m?.stage, active]);
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
      setCreating(false);
    });
  const leave = () =>
    run(async () => {
      if (room)
        try {
          await api(`/mabar/rooms/${room.id}/leave`, {});
        } catch {
          /* Always release the local controller when leaving an unavailable room. */
        }
      displayNull();
    });
  const displayNull = () => {
    setRoom(null);
    onRoom(null);
    localWrite("nyambung-mabar-room", null);
  };
  return (
    <section className="mabar-page" hidden={!active} aria-label="Mabar">
      <div className="mabar-heading">
        <h1>{room?.name ?? "Mabar"}</h1>
        {room && (
          <>
            <span role="status">{status}</span>
            <button className="text-button" onClick={() => void leave()}>
              Keluar room
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!room && busy && <p role="status">Menyiapkan room…</p>}
      {!room && error && platform.kind === "discord" && (
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
      {!room && platform.kind === "browser" && (
        <>
          <form
            className="mabar-profile"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setProfile(await api<GuestProfile>("/mabar/profile", { name }));
              });
            }}
          >
            <label>
              Nama guest
              <input
                value={name}
                maxLength={24}
                minLength={2}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={busy} className="secondary-button">
              Simpan profil
            </button>
            {profile && (
              <>
                <Avatar p={profile} />
                <label>
                  Foto
                  <input
                    type="file"
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
              </>
            )}
          </form>
          {profile && (
            <>
              <div className="mabar-toolbar">
                <button
                  className="primary-button"
                  onClick={() => setCreating(!creating)}
                >
                  Buat room
                </button>
                <label>
                  Cari room
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  Mode
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">Semua</option>
                    {Object.entries(modeLabels).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <form
                className="mabar-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  void join(joinCode);
                }}
              >
                <label>
                  Kode room
                  <input
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
                    type="password"
                    value={password}
                    maxLength={64}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Masuk</button>
              </form>
              {creating && (
                <form
                  className="mabar-settings"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      display(await api<RoomView>("/mabar/rooms", settings));
                      setCreating(false);
                    });
                  }}
                >
                  <Presets value={settings} change={setSettings} />
                  <button className="primary-button" disabled={busy}>
                    Buat dan masuk
                  </button>
                </form>
              )}
              <div className="room-list">
                {!rooms.length ? (
                  <p>Belum ada room.</p>
                ) : (
                  rooms.map((r) => (
                    <button
                      key={r.id}
                      className="room-list-row"
                      onClick={() => {
                        setJoinCode(r.id);
                        if (!r.locked) void join(r.id);
                        else setError("Isi password lalu tekan Masuk.");
                      }}
                    >
                      <strong>{r.name}</strong>
                      <span>{modeLabels[r.mode]}</span>
                      <small>
                        {r.count}/{r.capacity} ·{" "}
                        {r.phase === "lobby"
                          ? "Lobby"
                          : r.phase === "results"
                            ? "Rekap"
                            : "Bermain"}
                        {r.locked ? " · Password" : ""}
                      </small>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}
      {room && (
        <>
          <div className="mabar-toolbar">
            <strong>{modeLabels[room.mode]}</strong>
            {m && (
              <span>
                {
                  {
                    countdown: "Bersiap",
                    playing: "Bermain",
                    reveal: "Hasil babak",
                    gallery: "Galeri",
                    voting: "Voting",
                    results: "Selesai",
                  }[m.phase]
                }{" "}
                · {Math.min(m.stage + 1, m.total)}/{m.total}{" "}
                {m.deadline ? `· ${time} dtk` : ""}
              </span>
            )}
            {platform.kind === "discord" ? (
              <button
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
                onClick={() =>
                  void run(async () => {
                    const url = new URL(location.href);
                    url.searchParams.set("room", room.id);
                    await navigator.clipboard.writeText(url.href);
                    setStatus("Link disalin");
                  })
                }
              >
                Salin link
              </button>
            )}
          </div>
          {room.notice && <p role="status">{room.notice}</p>}
          <div className="mabar-columns">
            <div className="mabar-arena">
              {lobby && (
                <>
                  {self?.host && (
                    <button
                      onClick={() => {
                        setSettings({ ...room.settings });
                        setEditing(!editing);
                      }}
                    >
                      Atur room
                    </button>
                  )}
                  {editing && self?.host && (
                    <form
                      className="mabar-settings"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await send("settings", settings);
                          setEditing(false);
                        });
                      }}
                    >
                      <Presets value={settings} change={setSettings} />
                      {platform.kind === "browser" && (
                        <>
                          <p>Isi password baru untuk mengganti.</p>
                          {room.locked && (
                            <button
                              type="button"
                              onClick={() =>
                                setSettings({ ...settings, password: "" })
                              }
                            >
                              Hapus password
                              {settings.password === "" ? " · dipilih" : ""}
                            </button>
                          )}
                        </>
                      )}
                      <button disabled={busy}>Simpan pengaturan</button>
                    </form>
                  )}
                  {m?.phase === "results" && (
                    <>
                      <h2>Hasil mabar</h2>
                      <ol className="mabar-podium">
                        {[...room.members]
                          .filter((p) => !p.spectator)
                          .sort((a, b) => b.score - a.score)
                          .map((p) => (
                            <li key={p.id}>
                              #{p.rank} <Avatar p={p} /> <span>{p.name}</span>
                              <b>{p.score}</b>
                            </li>
                          ))}
                      </ol>
                      <button
                        onClick={() =>
                          void run(async () =>
                            downloadImage(await createMabarImage(room)),
                          )
                        }
                      >
                        Simpan gambar
                      </button>
                      {self?.host && (
                        <button onClick={() => void run(() => send("lobby"))}>
                          Main lagi
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="secondary-button"
                    aria-pressed={self?.ready}
                    disabled={busy}
                    onClick={() => void run(() => send("ready"))}
                  >
                    {self?.ready ? "Batal siap" : "Siap"}
                  </button>
                  {self?.host && (
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        room.members.filter((p) => !p.spectator).length <
                          (room.mode === "chain" ? 3 : 2) ||
                        room.members.some(
                          (p) => !p.spectator && (!p.ready || !p.online),
                        )
                      }
                      onClick={() => void run(() => send("start"))}
                    >
                      Mulai
                    </button>
                  )}
                </>
              )}
              {m?.phase === "countdown" && <h2>{time}</h2>}
              {m?.phase === "playing" && (
                <>
                  <h2 className="mabar-prompt">
                    {m.clues?.join(" / ") ||
                      m.prompt ||
                      (m.task === "drawing"
                        ? "Gambar dari kata ini"
                        : "Tulis kata atau tebak gambar")}
                  </h2>
                  {self?.spectator ? (
                    <p>Menonton · ikut pertandingan berikutnya</p>
                  ) : m.mode === "chain" ? (
                    <>
                      {m.previous?.text && (
                        <p className="chain-word">{m.previous.text}</p>
                      )}
                      {m.previous?.drawing && (
                        <DrawingPreview strokes={m.previous.drawing} />
                      )}
                      {m.submitted ? (
                        <p>Terkunci · menunggu pemain lain</p>
                      ) : (
                        <>
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
                          <button
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
                        </>
                      )}
                    </>
                  ) : m.submitted ? (
                    <p>Jawaban terkunci</p>
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
                          ? `Giliran ${room.members.find((p) => p.id === m.turn)?.name ?? "pemain"} · awal ${m.prompt.slice(-1).toUpperCase()}`
                          : "Jawaban"}
                        <input
                          aria-label="Jawaban mabar"
                          autoComplete="off"
                          maxLength={80}
                          value={input}
                          disabled={m.mode === "word" && m.turn !== room.self}
                          onChange={(e) => setInput(e.target.value)}
                        />
                      </label>
                      <button
                        className="primary-button"
                        disabled={
                          busy ||
                          !input.trim() ||
                          (m.mode === "word" && m.turn !== room.self)
                        }
                      >
                        Kirim
                      </button>
                    </form>
                  )}
                </>
              )}
              {m?.phase === "reveal" && (
                <>
                  <h2>{m.reveal?.answer}</h2>
                  <ul>
                    {m.reveal?.answers.map((a) => (
                      <li key={a.playerId}>
                        {room.members.find((p) => p.id === a.playerId)?.name}:{" "}
                        {a.word} · {a.score}
                        {a.connections && (
                          <small>
                            {" "}
                            ·{" "}
                            {a.connections
                              .map((n) => Math.round(n * 100) + "%")
                              .join(" / ")}
                          </small>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {m &&
                ["gallery", "voting", "results"].includes(m.phase) &&
                m.gallery && (
                  <>
                    <h2>
                      {m.phase === "voting" ? "Pilih rantai favorit" : "Galeri"}
                    </h2>
                    {m.gallery.map((chain, n) => (
                      <article className="chain-gallery" key={chain.owner}>
                        <h3>
                          Rantai {n + 1} ·{" "}
                          {room.members.find((p) => p.id === chain.owner)?.name}
                        </h3>
                        {chain.entries.map((entry, index) => (
                          <div key={index}>
                            <small>
                              {
                                room.members.find(
                                  (p) => p.id === entry.playerId,
                                )?.name
                              }
                            </small>
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
                              disabled={busy}
                              onClick={() => void run(() => send("vote", n))}
                            >
                              Pilih rantai {n + 1}
                            </button>
                          )}
                      </article>
                    ))}
                    {m.phase === "gallery" && self?.host && (
                      <button
                        onClick={() => void run(() => send("gallery-next"))}
                      >
                        Rantai berikutnya
                      </button>
                    )}
                    {m.phase === "voting" && !m.voted && !self?.spectator && (
                      <button onClick={() => void run(() => send("vote", -1))}>
                        Abstain
                      </button>
                    )}
                  </>
                )}
            </div>
            <aside className="mabar-players">
              <details className="mabar-roster" open>
                <summary>
                  Pemain {room.count}/{room.capacity}
                </summary>
                {room.members.map((p) => (
                  <div className="mabar-player" key={p.id}>
                    <Avatar p={p} />
                    <span>
                      {p.name}
                      <small>
                        {p.host ? "Host · " : ""}
                        {p.spectator
                          ? "Menonton"
                          : p.ready
                            ? "Siap"
                            : p.online
                              ? "Online"
                              : "Terputus"}{" "}
                        · {p.score}
                      </small>
                    </span>
                    {p.id !== room.self && (
                      <details>
                        <summary>Aksi</summary>
                        <button
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
                              key={type}
                              onClick={() => void run(() => send(type, p.id))}
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
                      </details>
                    )}
                  </div>
                ))}
              </details>
            </aside>
          </div>
          {lobby && (
            <section className="mabar-chat" aria-label="Chat room">
              <div role="log">
                {room.messages
                  .filter((msg) => !muted.includes(msg.playerId))
                  .map((msg) => (
                    <p key={msg.id}>
                      <b>
                        {room.members.find((p) => p.id === msg.playerId)
                          ?.name ?? "Pemain"}
                        :{" "}
                      </b>
                      {msg.text}
                    </p>
                  ))}
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
                  value={chat}
                  maxLength={240}
                  onChange={(e) => setChat(e.target.value)}
                />
                <button disabled={busy || !chat.trim()}>Kirim</button>
              </form>
            </section>
          )}
        </>
      )}
    </section>
  );
}

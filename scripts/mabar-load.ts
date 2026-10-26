import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../apps/api/src/db.js";
import { createMabar, type MabarIdentity } from "../apps/api/src/mabar.js";
import { attachMabar } from "../apps/api/src/mabar-ws.js";
const store = openDatabase(":memory:"),
  service = createMabar(store),
  server = createServer();
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const stop = attachMabar(server, service, ["http://localhost"]);
const port = (server.address() as { port: number }).port;
const groups: { id: string; people: MabarIdentity[]; sockets: WebSocket[] }[] =
  [];
const times: number[] = [];
try {
  for (let room = 0; room < 20; room++) {
    const people = Array.from(
      { length: 12 },
      (_, n): MabarIdentity => ({
        id: `load-${room}-${n}`,
        name: `Player ${n}`,
        avatar: null,
        source: "web",
      }),
    );
    for (const p of people)
      store.sqlite
        .prepare("INSERT INTO players VALUES(?,?)")
        .run(p.id, new Date().toISOString());
    const r = service.create(people[0], {
      name: `Load ${room}`,
      mode: "quick",
      rounds: 5,
      seconds: 20,
      capacity: 12,
    });
    for (const p of people.slice(1)) service.join(r.id, p);
    const sockets: WebSocket[] = [];
    for (const p of people) {
      const ticket = service.ticket(r.id, p);
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/api/mabar/ws?ticket=${ticket}`,
        { origin: "http://localhost" },
      );
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      sockets.push(ws);
    }
    groups.push({ id: r.id, people, sockets });
  }
  for (let round = 0; round < 5; round++)
    for (const group of groups) {
      const text = `probe-${round}-${group.id}`;
      const start = performance.now();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Broadcast timeout")),
          10000,
        );
        const observer = (raw: Buffer) => {
          const event = JSON.parse(raw.toString());
          if (
            event.type === "snapshot" &&
            event.room.messages.some((m: { text: string }) => m.text === text)
          ) {
            group.sockets.at(-1)!.off("message", observer);
            clearTimeout(timer);
            times.push(performance.now() - start);
            resolve();
          }
        };
        group.sockets.at(-1)!.on("message", observer);
        group.sockets[round].send(
          JSON.stringify({ id: randomUUID(), type: "chat", payload: text }),
        );
      });
    }
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1];
  console.log(
    JSON.stringify(
      {
        machine: `${platform()} ${arch()} ${cpus()[0].model}`,
        node: process.version,
        rooms: 20,
        connections: 240,
        samples: times.length,
        p95Ms: +p95.toFixed(2),
        maxMs: +times.at(-1)!.toFixed(2),
        rssMiB: Math.round(process.memoryUsage().rss / 1048576),
        targetMs: 200,
        passed: p95 < 200,
      },
      null,
      2,
    ),
  );
  if (p95 >= 200) process.exitCode = 1;
} finally {
  for (const group of groups) for (const ws of group.sockets) ws.terminate();
  stop();
  await new Promise<void>((r) => server.close(() => r()));
  store.sqlite.close();
}

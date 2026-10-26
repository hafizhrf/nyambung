import { it, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../apps/api/src/db.js";
import { createMabar } from "../apps/api/src/mabar.js";
import { attachMabar } from "../apps/api/src/mabar-ws.js";
it("requires Origin and a single-use ticket, broadcasts private projections, and replaces old controllers", async () => {
  const store = openDatabase(":memory:"),
    service = createMabar(store),
    server = createServer();
  const identities = [0, 1].map((n) => ({
    id: `p${n}`,
    name: `Pemain ${n}`,
    avatar: null,
    source: "web" as const,
  }));
  for (const p of identities)
    store.sqlite
      .prepare("INSERT INTO players VALUES(?,?)")
      .run(p.id, "2026-10-26");
  const room = service.create(identities[0], {
    name: "Socket room",
    mode: "quick",
    rounds: 5,
    seconds: 20,
  });
  service.join(room.id, identities[1]);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const stop = attachMabar(server, service, ["http://localhost"]);
  const base = `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/mabar/ws`;
  const sockets: WebSocket[] = [];
  const connect = async (
    n: number,
    ticket = service.ticket(room.id, identities[n]),
  ) => {
    const ws = new WebSocket(base + "?ticket=" + ticket, {
      origin: "http://localhost",
    });
    sockets.push(ws);
    await once(ws, "open");
    return ws;
  };
  try {
    const token = service.ticket(room.id, identities[0]);
    const denied = new WebSocket(base + "?ticket=" + token, {
      origin: "https://wrong.example",
    });
    await expect(once(denied, "open")).rejects.toThrow();
    const a = await connect(0, token),
      b = await connect(1);
    const reply = new Promise<any>((resolve) =>
      b.on("message", (raw) => {
        const e = JSON.parse(raw.toString());
        if (e.type === "snapshot" && e.room.messages.length) resolve(e);
      }),
    );
    a.send(JSON.stringify({ id: randomUUID(), type: "chat", payload: "hai" }));
    expect((await reply).room.messages[0].text).toBe("hai");
    const oldClosed = once(a, "close");
    await connect(0);
    expect((await oldClosed)[0]).toBe(4001);
    const reused = new WebSocket(base + "?ticket=" + token, {
      origin: "http://localhost",
    });
    await expect(once(reused, "open")).rejects.toThrow();
  } finally {
    for (const socket of sockets) socket.terminate();
    stop();
    await new Promise<void>((r) => server.close(() => r()));
    store.sqlite.close();
  }
});

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { MabarError, type MabarService } from "./mabar.js";
import type { MabarEvent } from "@nyambung/shared";
export function attachMabar(
  server: Server,
  service: MabarService,
  allowedOrigins: string[],
  validate?: (
    i: ReturnType<MabarService["redeem"]>["identity"],
  ) => Promise<void>,
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 131072,
    perMessageDeflate: false,
  });
  const connections = new Map<
    string,
    { ws: WebSocket; t: ReturnType<MabarService["redeem"]> }
  >();
  const send = (ws: WebSocket, event: MabarEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 262144) {
        ws.close(1013, "Koneksi tertinggal");
        return;
      }
      ws.send(JSON.stringify(event));
    }
  };
  const unsubscribe = service.subscribe((id) => {
    for (const { ws, t } of connections.values())
      if (t.room === id)
        try {
          send(ws, { type: "snapshot", room: service.view(id, t.identity) });
        } catch (e) {
          ws.close(
            e instanceof MabarError && e.status === 401 ? 4004 : 4003,
            "Room tidak tersedia",
          );
        }
  });
  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url!, "http://local");
      if (!["/api/mabar/ws", "/.proxy/api/mabar/ws"].includes(url.pathname))
        throw new Error("path");
      if (!allowedOrigins.includes(req.headers.origin ?? ""))
        throw new Error("origin");
      const t = service.redeem(url.searchParams.get("ticket") ?? "");
      wss.handleUpgrade(req, socket, head, (ws) => {
        const key = t.identity.id;
        const old = connections.get(key);
        if (old) {
          try {
            service.touch(old.t.room, old.t.identity, true);
          } catch {
            /* The old room may already have expired. */
          }
          old.ws.close(4001, "Sesi dibuka di perangkat lain");
        }
        connections.set(key, { ws, t });
        service.touch(t.room, t.identity);
        send(ws, { type: "snapshot", room: service.view(t.room, t.identity) });
        ws.on("error", () => ws.terminate());
        ws.on("pong", () => {
          if (connections.get(key)?.ws === ws)
            try {
              service.touch(t.room, t.identity);
            } catch (e) {
              ws.close(
                e instanceof MabarError && e.status === 401 ? 4004 : 4003,
              );
            }
        });
        ws.on("message", (data) => {
          if (connections.get(key)?.ws !== ws) return;
          let id: string | undefined;
          try {
            const input = JSON.parse(data.toString());
            id = input.id;
            service.command(t.room, t.identity, input);
            send(ws, { type: "ack", id: id! });
          } catch (e) {
            send(ws, {
              type: "error",
              id,
              error:
                (e as Error).name === "ZodError"
                  ? "Data tidak valid."
                  : (e as Error).message,
            });
          }
        });
        ws.on("close", () => {
          if (connections.get(key)?.ws !== ws) return;
          connections.delete(key);
          try {
            service.touch(t.room, t.identity, true);
          } catch {
            /* Room expired. */
          }
        });
      });
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
  const timer = setInterval(() => service.tick(), 500);
  const heartbeat = setInterval(() => {
    for (const { ws, t } of connections.values()) {
      try {
        const member = service
          .view(t.room, t.identity)
          .members.find((p) => p.id === t.identity.id);
        if (!member?.online) {
          ws.terminate();
          continue;
        }
        ws.ping();
        if (validate)
          void validate(t.identity).catch(() =>
            ws.close(4003, "Activity berakhir"),
          );
      } catch (e) {
        ws.close(e instanceof MabarError && e.status === 401 ? 4004 : 4003);
      }
    }
  }, 15000);
  return () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    unsubscribe();
    for (const { ws } of connections.values()) ws.terminate();
    wss.close();
  };
}

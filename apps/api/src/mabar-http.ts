import type { Hono } from "hono";
import { resolve, dirname } from "node:path";
import {
  mkdir,
  writeFile,
  readdir,
  stat,
  unlink,
  readFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { DiscordService, DiscordSession } from "./discord.js";
import type { Store } from "./db.js";
import { MabarError, type MabarService, type MabarIdentity } from "./mabar.js";
export const avatarDirectory = () =>
  resolve(
    process.env.UPLOAD_DIR ||
      resolve(
        dirname(process.env.DATABASE_PATH || "data/nyambung.sqlite"),
        "uploads",
      ),
    "avatars",
  );
export function registerMabar(
  app: Hono<any>,
  service: MabarService | undefined,
  store: Store,
  discord?: DiscordService,
) {
  app.get("/api/mabar/config", (c) => c.json({ enabled: !!service }));
  app.use("/api/mabar/*", async (c, next) => {
    if (!service) return c.json({ error: "Mabar belum diaktifkan." }, 404);
    await next();
  });
  async function identity(c: any): Promise<MabarIdentity> {
    const id = c.get("playerId") as string;
    const session = c.get("discordSession") as DiscordSession | undefined;
    if (session) {
      if (!discord) throw new MabarError("Discord belum tersedia.", 403);
      const room = await discord.verifiedInstance(
        session.instanceId,
        session.discordId,
      );
      const profile = store.sqlite
        .prepare("SELECT name,avatar FROM discord_identities WHERE player_id=?")
        .get(id) as { name: string; avatar: string | null };
      return {
        id: session.discordId,
        ...profile,
        expiresAt: session.expiresAt,
        discordId: session.discordId,
        avatar: profile.avatar
          ? `/discord-cdn/avatars/${session.discordId}/${profile.avatar}.png?size=128`
          : null,
        source: "discord",
        discordKey: `${discord.config.applicationId}:${session.instanceId}`,
        guildId: room.location.guild_id!,
        channelId: room.location.channel_id!,
      };
    }
    const profile = service!.profile(id);
    if (!profile) throw new MabarError("Isi nama profil dahulu.", 409);
    return { ...profile, source: "web" };
  }
  app.get("/api/mabar/profile", (c) =>
    c.json(service!.profile(c.get("playerId"))),
  );
  app.post("/api/mabar/profile", async (c) => {
    if (c.get("discordSession"))
      throw new MabarError("Profil mengikuti Discord.", 403);
    const data = await c.req.json();
    return c.json(service!.updateProfile(c.get("playerId"), data.name));
  });
  app.post("/api/mabar/avatar", async (c) => {
    if (c.get("discordSession"))
      throw new MabarError("Foto mengikuti Discord.", 403);
    const id = c.get("playerId");
    if (!service!.profile(id)) throw new MabarError("Isi nama profil dahulu.");
    service!.limit("avatar:" + id, 6);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (!bytes.length) return c.json(service!.avatar(id, null));
    if (bytes.length > 2 * 1024 * 1024)
      throw new MabarError("Foto maksimal 2 MB.", 413);
    try {
      const image = sharp(bytes, {
        limitInputPixels: 16000000,
        animated: false,
      });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? ""))
        throw new Error("format");
      const output = await image
        .rotate()
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer();
      await mkdir(avatarDirectory(), { recursive: true });
      const file = randomUUID() + ".webp";
      await writeFile(resolve(avatarDirectory(), file), output, { flag: "wx" });
      return c.json(service!.avatar(id, "/api/mabar/media/" + file));
    } catch (e) {
      if (e instanceof MabarError) throw e;
      throw new MabarError(
        "Gunakan foto JPEG, PNG, atau WebP maksimal 16 megapiksel.",
      );
    }
  });
  app.get("/api/mabar/media/:file", async (c) => {
    const name = c.req.param("file");
    if (!/^[a-f0-9-]{36}\.webp$/.test(name)) return c.notFound();
    try {
      const file = await readFile(resolve(avatarDirectory(), name));
      c.header("Content-Type", "image/webp");
      c.header("Cache-Control", "public,max-age=86400");
      return c.body(new Uint8Array(file));
    } catch {
      return c.notFound();
    }
  });
  app.get("/api/mabar/rooms", async (c) => {
    const i = await identity(c);
    if (i.source !== "web")
      throw new MabarError("Gunakan lobby Activity.", 403);
    return c.json(service!.list(c.req.query("q"), c.req.query("mode")));
  });
  app.post("/api/mabar/rooms", async (c) => {
    const i = await identity(c);
    if (i.source !== "web")
      throw new MabarError("Gunakan lobby Activity.", 403);
    return c.json(service!.create(i, await c.req.json()));
  });
  app.post("/api/mabar/discord", async (c) => {
    const i = await identity(c);
    if (i.source !== "discord") throw new MabarError("Buka dari Discord.", 403);
    return c.json(
      service!.create(i, {
        name: "Mabar Nyambung",
        visibility: "unlisted",
        mode: "quick",
        rounds: 10,
        seconds: 20,
      }),
    );
  });
  app.post("/api/mabar/rooms/:id/join", async (c) => {
    const i = await identity(c);
    const body = await c.req.json();
    return c.json(
      service!.join(
        c.req.param("id"),
        i,
        typeof body.password === "string" ? body.password : "",
      ),
    );
  });
  app.post("/api/mabar/rooms/:id/leave", async (c) => {
    service!.leave(c.req.param("id"), await identity(c));
    return c.json({ ok: true });
  });
  app.get("/api/mabar/rooms/:id", async (c) =>
    c.json(service!.view(c.req.param("id"), await identity(c))),
  );
  app.post("/api/mabar/rooms/:id/ticket", async (c) =>
    c.json({ ticket: service!.ticket(c.req.param("id"), await identity(c)) }),
  );
}
export async function pruneAvatars(store: Store) {
  const referenced = new Set(
    (
      store.sqlite
        .prepare("SELECT avatar FROM mabar_profiles WHERE avatar IS NOT NULL")
        .all() as { avatar: string }[]
    ).map((p) => p.avatar.split("/").pop()),
  );
  try {
    for (const file of await readdir(avatarDirectory())) {
      if (!/^[a-f0-9-]{36}\.webp$/.test(file) || referenced.has(file)) continue;
      const path = resolve(avatarDirectory(), file);
      if (Date.now() - (await stat(path)).mtimeMs > 86400000)
        await unlink(path);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("Avatar cleanup failed", e);
  }
}

import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  utimes,
  readdir,
} from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../apps/api/src/db.js";
import { createMabar } from "../apps/api/src/mabar.js";
import { createApp } from "../apps/api/src/app.js";
import { pruneAvatars } from "../apps/api/src/mabar-http.js";
import { archiveBackup } from "../scripts/backup-media.js";
it("validates uploads, converts avatars, preserves referenced media and restores a complete backup", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "nyambung-media-test-"));
  const previous = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = resolve(directory, "uploads");
  const store = openDatabase(resolve(directory, "source.sqlite"));
  const service = createMabar(store),
    app = createApp(store, undefined, { mabar: service });
  try {
    const bootstrap = await app.request("/api/mabar/profile");
    const cookie = bootstrap.headers.get("set-cookie")!.split(";")[0];
    const headers = { cookie, "Content-Type": "application/json" };
    await app.request("/api/mabar/profile", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Tamu Foto" }),
    });
    const upload = (body: BodyInit, as = cookie) =>
      app.request("/api/mabar/avatar", {
        method: "POST",
        headers: { cookie: as, "Content-Type": "application/octet-stream" },
        body,
      });
    expect((await upload("bukan gambar")).status).toBe(400);
    expect((await upload(new Uint8Array(2097153))).status).toBe(413);
    const large = await sharp({
      create: { width: 4001, height: 4001, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect((await upload(new Uint8Array(large))).status).toBe(400);
    const png = await sharp({
      create: { width: 500, height: 300, channels: 3, background: "red" },
    })
      .png()
      .withMetadata()
      .toBuffer();
    const response = await upload(new Uint8Array(png));
    expect(response.status).toBe(200);
    const result = await response.json();
    const name = result.avatar.split("/").pop();
    const path = resolve(directory, "uploads/avatars", name);
    const meta = await sharp(path).metadata();
    expect(meta).toMatchObject({ width: 256, height: 256, format: "webp" });
    expect(meta.exif).toBeUndefined();
    expect(
      (await app.request(result.avatar, { headers: { cookie } })).status,
    ).toBe(200);
    const other = (await app.request("/api/mabar/profile")).headers
      .get("set-cookie")!
      .split(";")[0];
    expect((await upload(new Uint8Array(png), other)).status).toBe(400);
    const orphan = randomUUID() + ".webp";
    await writeFile(resolve(directory, "uploads/avatars", orphan), png);
    await utimes(
      resolve(directory, "uploads/avatars", orphan),
      new Date(0),
      new Date(0),
    );
    await utimes(path, new Date(0), new Date(0));
    await pruneAvatars(store);
    expect(await readdir(resolve(directory, "uploads/avatars"))).toEqual([
      name,
    ]);
    const snapshot = resolve(directory, "snapshot.sqlite");
    await store.sqlite.backup(snapshot);
    const archive = resolve(directory, "backup.tar.gz");
    await archiveBackup(
      snapshot,
      resolve(directory, "uploads/avatars"),
      archive,
    );
    const target = resolve(directory, "restored");
    await mkdir(target);
    await promisify(execFile)("tar", ["-xzf", archive, "-C", target]);
    const restored = openDatabase(resolve(target, "nyambung.sqlite"));
    try {
      expect(
        restored.sqlite.prepare("SELECT avatar FROM mabar_profiles").get(),
      ).toEqual({ avatar: result.avatar });
      expect(await readFile(resolve(target, "uploads/avatars", name))).toEqual(
        await readFile(path),
      );
    } finally {
      restored.sqlite.close();
    }
    expect((await upload(new Uint8Array())).status).toBe(200);
    expect(
      (
        await (
          await app.request("/api/mabar/profile", { headers: { cookie } })
        ).json()
      ).avatar,
    ).toBeNull();
  } finally {
    store.sqlite.close();
    previous === undefined
      ? delete process.env.UPLOAD_DIR
      : (process.env.UPLOAD_DIR = previous);
    await rm(directory, { recursive: true, force: true });
  }
});

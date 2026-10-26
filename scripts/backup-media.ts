import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  rename,
  rm,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
/** Takes an immutable database snapshot and copies its referenced, immutable avatars. */
export async function archiveBackup(
  snapshot: string,
  avatars: string,
  destination: string,
) {
  const temporary = await mkdtemp(resolve(tmpdir(), "nyambung-backup-"));
  const output = destination + ".partial";
  try {
    await copyFile(snapshot, resolve(temporary, "nyambung.sqlite"));
    await mkdir(resolve(temporary, "uploads/avatars"), { recursive: true });
    const db = new Database(snapshot, { readonly: true });
    let paths: string[] = [];
    try {
      if (
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE name='mabar_profiles'")
          .get()
      )
        paths = (
          db
            .prepare(
              "SELECT avatar FROM mabar_profiles WHERE avatar IS NOT NULL",
            )
            .all() as { avatar: string }[]
        )
          .map((r) => r.avatar.split("/").pop()!)
          .filter((name) => /^[a-f0-9-]{36}\.webp$/.test(name));
    } finally {
      db.close();
    }
    for (const name of new Set(paths))
      await copyFile(
        resolve(avatars, name),
        resolve(temporary, "uploads/avatars", name),
      );
    await promisify(execFile)("tar", [
      "-czf",
      output,
      "-C",
      temporary,
      "nyambung.sqlite",
      "uploads",
    ]);
    await chmod(output, 0o600);
    await rename(output, destination);
    return destination;
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(output, { force: true });
  }
}

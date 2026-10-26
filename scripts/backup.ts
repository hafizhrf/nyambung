import { mkdirSync, createReadStream, createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { pruneBackups } from './backup-retention.js';
try { process.loadEnvFile(resolve('.env')); } catch { /* optional */ }
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'backups');
mkdirSync(directory, { recursive: true });
// Opening a backup must not run migrations against the production database.
const sqlite=new Database(resolve(root,process.env.DATABASE_PATH||'data/nyambung.sqlite'),{readonly:true});
const destination=resolve(directory,`nyambung-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite.gz`);
const raw=destination+'.raw.partial',compressed=destination+'.partial';
try {
  await sqlite.backup(raw);sqlite.close();
  await pipeline(createReadStream(raw),createGzip({level:1}),createWriteStream(compressed,{mode:0o600,flags:'wx'}));
  await rename(compressed,destination);
  await rm(raw,{force:true});
  const result=await pruneBackups(directory,destination);
  console.log(`Backup konsisten tersimpan: ${result.retained}`);
  console.log(`${result.removed} backup lama dihapus; ${Math.round(result.freed/1048576)} MiB dibebaskan.`);
} finally {
  if(sqlite.open)sqlite.close();
  await rm(raw,{force:true});await rm(compressed,{force:true});
}

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../apps/api/src/db.js';
try { process.loadEnvFile(resolve('.env')); } catch { /* optional */ }
mkdirSync('backups', { recursive: true });
const store = openDatabase();
const destination = resolve('backups', `nyambung-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
try { await store.sqlite.backup(destination); console.log(`Backup konsisten tersimpan: ${destination}`); } finally { store.sqlite.close(); }

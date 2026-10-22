import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { openDatabase } from './db.js';
try { process.loadEnvFile(resolve(import.meta.dirname, '../../../.env')); } catch { /* optional */ }
const store = openDatabase();
const app = createApp(store);
const web = resolve(import.meta.dirname, '../../web/dist');
app.use('*', async (c, next) => { c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'strict-origin-when-cross-origin'); await next(); });
app.get('*', serveStatic({ root: web }));
app.use('*', async (c, next) => { if (c.req.path.startsWith('/api/')) return c.notFound(); return await serveStatic({ path: resolve(web, 'index.html') })(c, next); });
const server = serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000), hostname: process.env.HOST || '127.0.0.1' }, info => console.log(`Nyambung API: http://127.0.0.1:${info.port}`));
function close() { server.close(() => { store.sqlite.close(); process.exit(0); }); }
process.on('SIGTERM', close); process.on('SIGINT', close);

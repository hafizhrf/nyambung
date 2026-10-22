import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { eq, and, isNull } from 'drizzle-orm';
import { answerInput, type DailyView } from '@nyambung/shared';
import { daily, players, runs } from './schema.js';
import { game, GameError } from './game.js';
import { wibDate, nextReset } from './time.js';
import type { Store } from './db.js';
export function createApp(store: Store, clock: () => Date = () => new Date()) {
  const app = new Hono<{ Variables: { playerId: string } }>();
  const service = game(store, clock);
  const limits = new Map<string, { count: number; until: number }>();
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      const allowedOrigin = process.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
      // Vite and the API use different ports locally. Allow only the known
      // development origins; configured/public origins stay authoritative.
      const localDevOrigin = !process.env.PUBLIC_ORIGIN
        && process.env.NODE_ENV !== 'production'
        && (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173');
      if (origin && origin !== allowedOrigin && !localDevOrigin) return c.json({ error: 'Origin tidak diizinkan.' }, 403);
    }
    let playerId = getCookie(c, 'nyambung_session');
    if (!playerId || !store.orm.select().from(players).where(eq(players.id, playerId)).get()) {
      playerId = service.createPlayer();
      setCookie(c, 'nyambung_session', playerId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/', maxAge: 365 * 86400 });
    }
    c.set('playerId', playerId);
    if (c.req.method === 'POST') {
      const now = Date.now();
      if (limits.size > 10000) for (const [key, item] of limits) if (item.until < now) limits.delete(key);
      let limit = limits.get(playerId);
      if (!limit || limit.until < now) { limit = { count: 0, until: now + 60000 }; limits.set(playerId, limit); }
      if (++limit.count > 60) { c.header('Retry-After', '60'); return c.json({ error: 'Terlalu cepat. Tunggu sebentar, ya.' }, 429); }
    }
    await next();
  });
  app.use('/api/*', bodyLimit({ maxSize: 1024, onError: c => c.json({ error: 'Permintaan terlalu besar.' }, 413) }));
  app.get('/api/daily', c => {
    const now = clock(); const date = wibDate(now);
    const puzzle = store.orm.select({ number: daily.number, demo: daily.demo }).from(daily).where(eq(daily.date, date)).get();
    const run = store.orm.select().from(runs).where(and(eq(runs.playerId, c.get('playerId')), eq(runs.date, date), eq(runs.mode, 'daily'), isNull(runs.supersededAt))).get();
    const result: DailyView = { date, serverTime: now.toISOString(), resetsAt: nextReset(now), available: !!puzzle, number: puzzle?.number ?? null, demo: puzzle?.demo ?? false, run: run ? service.view(run.id, c.get('playerId')) : null };
    return c.json(result);
  });
  app.get('/api/random', c => c.json(service.randomStatus(c.get('playerId'))));
  app.post('/api/random/runs', c => c.json(service.startRandom(c.get('playerId'))));
  app.get('/api/runs/:id/comparison', c => c.json(service.comparison(c.req.param('id'), c.get('playerId'))));
  app.post('/api/runs', c => c.json(service.start(c.get('playerId'))));
  app.get('/api/runs/:id', c => c.json(service.view(c.req.param('id'), c.get('playerId'))));
  app.post('/api/runs/:id/answers', async c => {
    const parsed = answerInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Tulis satu kata atau pilih lewati.' }, 400);
    return c.json(service.submit(c.req.param('id'), c.get('playerId'), parsed.data));
  });
  app.get('/api/me/stats', c => c.json(service.stats(c.get('playerId'))));
  app.notFound(c => c.json({ error: 'Halaman tidak ditemukan.' }, 404));
  app.onError((error, c) => {
    if (error instanceof GameError) return c.json({ error: error.message }, error.status);
    console.error(error); return c.json({ error: 'Ada gangguan. Progres yang sudah tersimpan tetap aman. Coba lagi.' }, 500);
  });
  return app;
}

import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { eq, and, isNull } from 'drizzle-orm';
import { answerInput, type DailyView } from '@nyambung/shared';
import { daily, players, runs } from './schema.js';
import { game, GameError } from './game.js';
import { wibDate, nextReset } from './time.js';
import type { Store } from './db.js';
import { createDiscordService, discordConfig, DiscordError, DiscordHttpError, type DiscordService, type DiscordSession } from './discord.js';
import { createDiscordBot } from './discord-reminders.js';
export function createApp(store: Store, clock: () => Date = () => new Date(), integrations?: { discord?: DiscordService; bot?: ReturnType<typeof createDiscordBot> }) {
  const config = integrations?.discord?.config ?? discordConfig();
  const discord = integrations?.discord ?? (config ? createDiscordService(store, config, clock) : undefined);
  const bot = integrations?.bot ?? (discord ? createDiscordBot(store, discord, clock) : undefined);
  const app = new Hono<{ Variables: { playerId: string; discordSession: DiscordSession } }>();
  const service = game(store, clock);
  const limits = new Map<string, { count: number; until: number }>();
  // Discord signs the original request body. This route must precede cookie,
  // browser Origin and game-body middleware, without weakening those routes.
  app.post('/api/discord/interactions', bodyLimit({ maxSize: 65536, onError: c => c.json({ error: 'Permintaan terlalu besar.' }, 413) }), async c => {
    c.header('Cache-Control', 'no-store');
    if (!discord || !bot) return c.json({ error: 'Discord belum diaktifkan.' }, 404);
    const raw = await c.req.text();
    if (!discord.verifyInteraction(raw, c.req.header('x-signature-ed25519'), c.req.header('x-signature-timestamp'))) return c.json({ error: 'Signature tidak valid.' }, 401);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return c.json({ error: 'Interaction tidak valid.' }, 400); }
    return c.json(await bot.handle(input));
  });
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
      const discordOrigin = discord && origin === `https://${discord.config.applicationId}.discordsays.com`;
      if (origin && origin !== allowedOrigin && !localDevOrigin && !discordOrigin) return c.json({ error: 'Origin tidak diizinkan.' }, 403);
      if (c.req.path === '/api/discord/auth' && !origin) return c.json({ error: 'Origin diperlukan.' }, 403);
    }
    if (c.req.path === '/api/discord/bootstrap' || c.req.path === '/api/discord/auth') { await next(); return; }
    const bearer = c.req.header('authorization');
    if (bearer) {
      if (!discord) throw new DiscordError('Discord belum diaktifkan.', 401);
      const session = discord.session(bearer);
      c.set('playerId', session.playerId); c.set('discordSession', session);
    } else {
      if (c.req.path.startsWith('/api/discord/')) throw new DiscordError('Masuk melalui Discord terlebih dahulu.', 401);
      let playerId = getCookie(c, 'nyambung_session');
      if (!playerId || !store.orm.select().from(players).where(eq(players.id, playerId)).get()) {
        playerId = service.createPlayer();
        setCookie(c, 'nyambung_session', playerId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/', maxAge: 365 * 86400 });
      }
      c.set('playerId', playerId);
    }
    if (c.req.method === 'POST') {
      const playerId = c.get('playerId');
      const now = Date.now();
      if (limits.size > 10000) for (const [key, item] of limits) if (item.until < now) limits.delete(key);
      let limit = limits.get(playerId);
      if (!limit || limit.until < now) { limit = { count: 0, until: now + 60000 }; limits.set(playerId, limit); }
      if (++limit.count > 60) { c.header('Retry-After', '60'); return c.json({ error: 'Terlalu cepat. Tunggu sebentar, ya.' }, 429); }
    }
    await next();
  });
  app.use('/api/*', (c, next) => bodyLimit({ maxSize: c.req.path === '/api/discord/auth' ? 4096 : 1024, onError: c => c.json({ error: 'Permintaan terlalu besar.' }, 413) })(c, next));
  app.get('/api/discord/bootstrap', c => {
    if (!discord) return c.json({ error: 'Discord belum diaktifkan.' }, 404);
    return c.json(discord.bootstrap());
  });
  app.post('/api/discord/auth', async c => {
    if (!discord) return c.json({ error: 'Discord belum diaktifkan.' }, 404);
    return c.json(await discord.authenticate(await c.req.json().catch(() => null)));
  });
  app.get('/api/discord/instances/:id/progress', async c => {
    if (!discord || !c.get('discordSession')) return c.json({ error: 'Masuk melalui Discord terlebih dahulu.' }, 401);
    return c.json(await discord.progress(c.req.param('id'), c.get('discordSession')));
  });
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
    if (error instanceof DiscordError) { if (error.status === 429) c.header('Retry-After', String(error.retryAfter)); return c.json({ error: error.message }, error.status); }
    if (error instanceof DiscordHttpError) return c.json({ error: 'Discord belum bisa dihubungi. Coba sebentar lagi.' }, 503);
    if (error instanceof GameError) return c.json({ error: error.message }, error.status);
    console.error(error); return c.json({ error: 'Ada gangguan. Progres yang sudah tersimpan tetap aman. Coba lagi.' }, 500);
  });
  return app;
}

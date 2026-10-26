import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { z } from 'zod';
import type { DiscordAuthResult, DiscordRoomProgress, DiscordServerScores } from '@nyambung/shared';
import type { Store } from './db.js';
import { wibDate } from './time.js';

const snowflake = z.string().regex(/^\d{5,24}$/);
const instanceId = z.string().min(1).max(200).regex(/^[\w-]+$/);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export interface DiscordConfig { applicationId: string; clientSecret: string; publicKey: string; botToken: string; guildId: string; guildIds?:string[]; publicOrigin: string }
export const discordGuildIds = (config:DiscordConfig) => [...new Set([config.guildId,...(config.guildIds??[])])];
export function discordConfig(): DiscordConfig | undefined {
  if (process.env.DISCORD_ENABLED !== 'true') return;
  const fields = ['DISCORD_APPLICATION_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_PUBLIC_KEY', 'DISCORD_BOT_TOKEN', 'DISCORD_BETA_GUILD_ID', 'PUBLIC_ORIGIN'] as const;
  if (fields.some(key => !process.env[key])) throw new Error('Konfigurasi Discord belum lengkap. Lihat docs/discord.md.');
  const config = { applicationId: process.env.DISCORD_APPLICATION_ID!, clientSecret: process.env.DISCORD_CLIENT_SECRET!, publicKey: process.env.DISCORD_PUBLIC_KEY!, botToken: process.env.DISCORD_BOT_TOKEN!, guildId: process.env.DISCORD_BETA_GUILD_ID!, guildIds:(process.env.DISCORD_GUILD_IDS??'').split(',').map(id=>id.trim()).filter(Boolean), publicOrigin: process.env.PUBLIC_ORIGIN! };
  if (!snowflake.safeParse(config.applicationId).success || discordGuildIds(config).some(id=>!snowflake.safeParse(id).success) || !/^[\da-f]{64}$/i.test(config.publicKey) || new URL(config.publicOrigin).protocol !== 'https:' || new URL(config.publicOrigin).origin !== config.publicOrigin) throw new Error('ID, public key, atau origin HTTPS Discord tidak valid.');
  return config;
}
export class DiscordError extends Error {
  constructor(message: string, public status: 400 | 401 | 403 | 404 | 429 | 503 = 503, public retryAfter = 30) { super(message); }
}
export class DiscordHttpError extends Error {
  constructor(public status: number, public retryAfter: number = 30) { super(`Discord HTTP ${status}`); }
}
export class DiscordClient {
  constructor(public config: DiscordConfig, private fetcher: typeof fetch = fetch) {}
  async request<T>(path: string, options: { method?: string; body?: unknown; bearer?: string; form?: URLSearchParams; file?:{name:string;data:Uint8Array} } = {}): Promise<T> {
    let response: Response;
    const upload=options.file ? new FormData() : undefined;
    if(upload && options.file){upload.set('payload_json',JSON.stringify(options.body??{}));upload.set('files[0]',new Blob([new Uint8Array(options.file.data).buffer],{type:'image/png'}),options.file.name);}
    try {
      response = await this.fetcher(`https://discord.com/api/v10${path}`, {
        method: options.method || 'GET', signal: AbortSignal.timeout(10000),
        headers: { ...(options.form || path.startsWith('/webhooks/') ? {} : { Authorization: options.bearer ? `Bearer ${options.bearer}` : `Bot ${this.config.botToken}` }), ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : !upload && options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: upload ?? options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      });
    } catch { throw new DiscordHttpError(0); }
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { retry_after?: number };
      throw new DiscordHttpError(response.status, Math.max(1, Number(data.retry_after) || Number(response.headers.get('retry-after')) || 30));
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }
}
const userSchema = z.object({ id: snowflake, username: z.string(), global_name: z.string().nullish(), avatar: z.string().nullish() });
const instanceSchema = z.object({ application_id: snowflake, instance_id: instanceId, location: z.object({ guild_id: snowflake.optional(), channel_id: snowflake.optional() }), users: z.array(snowflake).max(1000) });
type Instance = z.infer<typeof instanceSchema>;
export interface DiscordSession { discordId: string; playerId: string; instanceId: string }
export function createDiscordService(store: Store, config: DiscordConfig, clock: () => Date = () => new Date(), fetcher: typeof fetch = fetch) {
  const client = new DiscordClient(config, fetcher);
  const nonces = new Map<string, number>();
  const instances = new Map<string, { data: Instance; until: number }>();
  let authWindow = { until: 0, count: 0 };
  function bootstrap() {
    const now = clock().getTime();
    if (authWindow.until <= now) authWindow = { until: now + 60000, count: 0 };
    if (++authWindow.count > 120) throw new DiscordError('Terlalu banyak permintaan masuk. Coba sebentar lagi.', 429);
    for (const [key, expires] of nonces) if (expires <= now) nonces.delete(key);
    const nonce = randomBytes(24).toString('hex'); nonces.set(digest(nonce), now + 300000);
    return { applicationId: config.applicationId, nonce };
  }
  async function instance(id: string, discordId: string, fresh = false) {
    if (!instanceId.safeParse(id).success) throw new DiscordError('Activity tidak valid.', 400);
    const now = clock().getTime();
    let cached = fresh ? undefined : instances.get(id);
    if (!cached || cached.until <= now) {
      let data: Instance;
      try { data = instanceSchema.parse(await client.request(`/applications/${config.applicationId}/activity-instances/${encodeURIComponent(id)}`)); }
      catch (error) { if (error instanceof DiscordHttpError && error.status === 404) throw new DiscordError('Activity sudah berakhir. Buka kembali dari Discord.', 403); throw error; }
      if (data.application_id !== config.applicationId || data.instance_id !== id || !data.location.guild_id || !discordGuildIds(config).includes(data.location.guild_id)) throw new DiscordError('Activity belum diaktifkan untuk server ini.', 403);
      if (instances.size > 1000) for (const [key, value] of instances) if (value.until <= now) instances.delete(key);
      cached = { data, until: now + 5000 }; instances.set(id, cached);
    }
    if (!cached.data.users.includes(discordId)) throw new DiscordError('Kamu bukan peserta Activity ini.', 403);
    return cached.data;
  }
  async function authenticate(input: unknown): Promise<DiscordAuthResult> {
    const parsed = z.object({ code: z.string().min(1).max(2048), nonce: z.string().length(48), instanceId }).safeParse(input);
    if (!parsed.success) throw new DiscordError('Permintaan masuk Discord tidak valid.', 400);
    const key = digest(parsed.data.nonce), expires = nonces.get(key); nonces.delete(key);
    if (!expires || expires <= clock().getTime()) throw new DiscordError('Permintaan masuk kedaluwarsa. Coba lagi.', 401);
    const token = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(await client.request('/oauth2/token', { method: 'POST', form: new URLSearchParams({ client_id: config.applicationId, client_secret: config.clientSecret, grant_type: 'authorization_code', code: parsed.data.code }) }));
    const authorization = z.object({ application: z.object({ id: snowflake }), scopes: z.array(z.string()) }).parse(await client.request('/oauth2/@me', { bearer: token.access_token }));
    if (authorization.application.id !== config.applicationId || !authorization.scopes.includes('identify')) throw new DiscordError('Izin Discord tidak valid.', 401);
    const user = userSchema.parse(await client.request('/users/@me', { bearer: token.access_token }));
    await instance(parsed.data.instanceId, user.id, true);
    const now = clock().getTime(), sessionToken = randomBytes(32).toString('hex');
    const expiresAt = now + Math.min(3600, token.expires_in) * 1000;
    store.sqlite.transaction(() => {
      const existing = store.sqlite.prepare('SELECT player_id FROM discord_identities WHERE discord_id = ?').get(user.id) as { player_id: string } | undefined;
      const playerId = existing?.player_id ?? randomUUID();
      if (!existing) store.sqlite.prepare('INSERT INTO players(id,created_at) VALUES (?,?)').run(playerId, clock().toISOString());
      store.sqlite.prepare(`INSERT INTO discord_identities(discord_id,player_id,name,avatar,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,updated_at=excluded.updated_at`).run(user.id, playerId, user.global_name || user.username, user.avatar ?? null, now);
      store.sqlite.prepare('DELETE FROM discord_sessions WHERE expires_at <= ?').run(now);
      store.sqlite.prepare('INSERT INTO discord_sessions(token_hash,discord_id,instance_id,expires_at) VALUES (?,?,?,?)').run(digest(sessionToken), user.id, parsed.data.instanceId, expiresAt);
    }).immediate();
    return { accessToken: token.access_token, sessionToken, expiresAt, user: { id: user.id, name: user.global_name || user.username }, instanceId: parsed.data.instanceId };
  }
  function session(header: string): DiscordSession {
    if (!/^Bearer [\da-f]{64}$/.test(header)) throw new DiscordError('Sesi Discord tidak valid. Buka kembali permainan.', 401);
    const row = store.sqlite.prepare(`SELECT s.discord_id, i.player_id, s.instance_id FROM discord_sessions s JOIN discord_identities i ON i.discord_id=s.discord_id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(header.slice(7)), clock().getTime()) as { discord_id: string; player_id: string; instance_id: string } | undefined;
    if (!row) throw new DiscordError('Sesi Discord habis. Masuk kembali untuk melanjutkan.', 401);
    return { discordId: row.discord_id, playerId: row.player_id, instanceId: row.instance_id };
  }
  async function progress(id: string, viewer: DiscordSession, runId?: string): Promise<DiscordRoomProgress> {
    if (viewer.instanceId !== id) throw new DiscordError('Activity tidak sesuai dengan sesi.', 403);
    const room = await instance(id, viewer.discordId);
    const guildId=room.location.guild_id!;
    const date = wibDate(clock());
    // The channel comes from Discord's verified instance, never from the browser.
    if (room.location.channel_id) {
      const selected = runId ? store.sqlite.prepare('SELECT id FROM runs WHERE id=? AND player_id=? AND superseded_at IS NULL').get(runId, viewer.playerId) as { id: string } | undefined : undefined;
      if (runId && !selected) throw new DiscordError('Permainan tidak ditemukan.', 404);
      const now = clock().getTime();
      store.sqlite.transaction(() => {
        store.sqlite.prepare(`INSERT INTO discord_activity_players(instance_id,discord_id,guild_id,channel_id,run_id,last_seen) VALUES (?,?,?,?,?,?)
          ON CONFLICT(instance_id,discord_id) DO UPDATE SET guild_id=excluded.guild_id,channel_id=excluded.channel_id,run_id=excluded.run_id,last_seen=excluded.last_seen`).run(id, viewer.discordId, guildId, room.location.channel_id!, selected?.id ?? null, now);
        if (selected) store.sqlite.prepare(`INSERT OR IGNORE INTO discord_channel_runs(channel_id,run_id,guild_id,discord_id,seen_at) VALUES (?,?,?,?,?)`).run(room.location.channel_id!, selected.id, guildId, viewer.discordId, now);
        for (const old of store.sqlite.prepare('SELECT discord_id FROM discord_activity_players WHERE instance_id=? AND last_seen>0').all(id) as { discord_id:string }[]) {
          if (!room.users.includes(old.discord_id)) store.sqlite.prepare('UPDATE discord_activity_players SET last_seen=0 WHERE instance_id=? AND discord_id=?').run(id, old.discord_id);
        }
        store.sqlite.prepare(`INSERT OR IGNORE INTO discord_channel_cards(channel_id,date,guild_id) VALUES (?,?,?)`).run(room.location.channel_id!, date, guildId);
      }).immediate();
    }
    const puzzle = store.sqlite.prepare('SELECT number FROM daily WHERE date=?').get(date) as { number: number } | undefined;
    const participants = room.users.map(discordId => {
      const identity = store.sqlite.prepare('SELECT player_id,name,avatar FROM discord_identities WHERE discord_id=?').get(discordId) as { player_id: string; name: string; avatar: string | null } | undefined;
      if (!identity) return { id: discordId, name: 'Pemain terhubung', avatar: null, stages: 0, completed: false, total: null };
      const run = store.sqlite.prepare(`SELECT id,completed_at FROM runs WHERE player_id=? AND date=? AND mode='daily' AND superseded_at IS NULL`).get(identity.player_id, date) as { id: string; completed_at: string | null } | undefined;
      const scores = run ? store.sqlite.prepare('SELECT json_extract(result,\'$.score\') AS score FROM answers WHERE run_id=?').all(run.id) as { score: number }[] : [];
      return { id: discordId, name: identity.name, avatar: identity.avatar, stages: scores.length, completed: !!run?.completed_at, total: run?.completed_at ? scores.reduce((sum, row) => sum + row.score, 0) : null };
    });
    return { date, number: puzzle?.number ?? null, participants };
  }
  async function serverScores(viewer:DiscordSession,runId:string):Promise<DiscordServerScores> {
    const room=await instance(viewer.instanceId,viewer.discordId);
    const own=store.sqlite.prepare(`SELECT date FROM runs WHERE id=? AND player_id=? AND mode='daily' AND completed_at IS NOT NULL`).get(runId,viewer.playerId) as {date:string}|undefined;
    if(!own)throw new DiscordError('Selesaikan Daily untuk melihat skor server.',403);
    const rows=store.sqlite.prepare(`WITH scores AS (
      SELECT i.discord_id AS id,i.name,i.avatar,SUM(CAST(json_extract(a.result,'$.score') AS INTEGER)) AS score
      FROM discord_identities i JOIN runs r ON r.player_id=i.player_id JOIN answers a ON a.run_id=r.id
      JOIN puzzle_versions v ON v.id=r.version_id
      WHERE r.date=? AND r.mode='daily' AND r.completed_at IS NOT NULL AND r.superseded_at IS NULL AND v.demo=0
      AND EXISTS (SELECT 1 FROM discord_channel_runs c WHERE c.run_id=r.id AND c.discord_id=i.discord_id AND c.guild_id=?)
      GROUP BY r.id HAVING COUNT(a.stage)=5)
      SELECT *,RANK() OVER (ORDER BY score DESC) AS rank,COUNT(*) OVER () AS totalPlayers FROM scores ORDER BY score DESC,id LIMIT 50`).all(own.date,room.location.guild_id!) as (DiscordServerScores['players'][number]&{totalPlayers:number})[];
    return {date:own.date,totalPlayers:rows[0]?.totalPlayers??0,players:rows.map(({totalPlayers,...player})=>player)};
  }
  function verifyInteraction(raw: string, signature: string | undefined, timestamp: string | undefined) {
    if (!signature || !/^[\da-f]{128}$/i.test(signature) || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(clock().getTime() - Number(timestamp) * 1000) > 300000) return false;
    try {
      const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(config.publicKey, 'hex')]), format: 'der', type: 'spki' });
      return verify(null, Buffer.from(timestamp + raw), key, Buffer.from(signature, 'hex'));
    } catch { return false; }
  }
  return { config, client, bootstrap, authenticate, session, progress, serverScores, verifyInteraction };
}
export type DiscordService = ReturnType<typeof createDiscordService>;

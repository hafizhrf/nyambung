import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { openDatabase, type Store } from '../apps/api/src/db.js';
import { createApp } from '../apps/api/src/app.js';
import { createDiscordService, type DiscordConfig } from '../apps/api/src/discord.js';
import { createDiscordBot, reminderMessage } from '../apps/api/src/discord-reminders.js';
import { compilePackets, publish } from '../scripts/content.js';
let store: Store, now: Date, service: ReturnType<typeof createDiscordService>, bot: ReturnType<typeof createDiscordBot>, app: ReturnType<typeof createApp>;
let config: DiscordConfig;
const keys = generateKeyPairSync('ed25519');
const appId = '111111111111111111', guildId = '222222222222222222', channelId = '333333333333333333';
const alice = '444444444444444444', bob = '555555555555555555', botId = '666666666666666666';
let users: string[], authenticatedUser: string;
let messages: any[], sent: any[], postFailure: number, timeoutAfterSend: boolean, historyFailure: boolean;
let fetcher: ReturnType<typeof vi.fn>;
const remote = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input)), path = url.pathname.replace('/api/v10', '');
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (path === '/oauth2/token') return response({ access_token: 'oauth-token', expires_in: 7200 });
  if (path === '/oauth2/@me') return response({ application: { id: appId }, scopes: ['identify', 'rpc.activities.write'] });
  if (path === '/users/@me') return response({ id: (init?.headers as any)?.Authorization === 'Bearer oauth-token' ? authenticatedUser : botId, username: authenticatedUser === alice ? 'Alice' : 'Bob', avatar: null });
  if (path.includes('/activity-instances/')) return response({ application_id: appId, instance_id: path.split('/').at(-1), location: { guild_id: guildId }, users });
  if (path === `/channels/${channelId}`) return response({ guild_id: guildId, type: 0, permission_overwrites: [] });
  if (path.endsWith(`/members/${botId}`)) return response({ roles: [] });
  if (path.endsWith('/roles')) return response([{ id: guildId, permissions: String(1024 + 2048 + 65536) }]);
  if (path.includes('/webhooks/')) return response({});
  if (path === `/channels/${channelId}/messages`) {
    if (init?.method === 'POST') {
      if (postFailure) return response({ retry_after: 10 }, postFailure);
      const body = JSON.parse(init.body as string); sent.push(body);
      const message = { ...body, id: '1555555555555555555', author: { id: botId } }; messages.unshift(message);
      if (timeoutAfterSend) { timeoutAfterSend = false; throw new Error('socket closed after accepting'); }
      return response(message);
    }
    if (historyFailure) return response({}, 403);
    return response(messages);
  }
  throw new Error(`Unmocked Discord path ${path}`);
};
beforeEach(() => {
  store = openDatabase(':memory:'); now = new Date('2026-10-21T17:05:00Z');
  publish(store, compilePackets(store, '2026-10-22', true));
  config = { applicationId: appId, guildId, clientSecret: 'test-secret', publicKey: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'), botToken: 'test-token', publicOrigin: 'https://nyambung.example' };
  users = [alice, bob]; authenticatedUser = alice; messages = []; sent = []; postFailure = 0; timeoutAfterSend = false; historyFailure = false;
  fetcher = vi.fn(remote);
  service = createDiscordService(store, config, () => now, fetcher as typeof fetch);
  bot = createDiscordBot(store, service, () => now);
  app = createApp(store, () => now, { discord: service, bot });
});
afterEach(async () => { await bot.drain(); store.sqlite.close(); vi.unstubAllEnvs(); });
async function login(user = alice, room = 'room-one') {
  authenticatedUser = user;
  const bootstrap = await (await app.request('https://nyambung.example/api/discord/bootstrap')).json();
  const response = await app.request('https://nyambung.example/api/discord/auth', { method: 'POST', headers: { Origin: `https://${appId}.discordsays.com`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'valid-code', nonce: bootstrap.nonce, instanceId: room }) });
  return { response, data: await response.json() as any };
}
async function api(path: string, token: string, body?: unknown) {
  const response = await app.request(`https://nyambung.example/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, Origin: `https://${appId}.discordsays.com`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() as any };
}
let sequence = 777777777777770000n;
async function interact(extra: object = {}, timestamp = Math.floor(now.getTime() / 1000).toString()) {
  const payload = { id: String(sequence++), application_id: appId, guild_id: guildId, type: 2, token: 'interaction-token', member: { permissions: '32', user: { id: alice } }, data: { name: 'nyambung', options: [{ name: 'main' }] }, ...extra };
  const raw = JSON.stringify(payload);
  const headers = { 'x-signature-timestamp': timestamp, 'x-signature-ed25519': sign(null, Buffer.from(timestamp + raw), keys.privateKey).toString('hex') };
  const response = await app.request('https://nyambung.example/api/discord/interactions', { method: 'POST', headers, body: raw });
  return { response, data: await response.json() as any, headers, raw };
}
const reminderCommand = (name: string, value?: string) => ({ data: { name: 'nyambung', options: [{ name: 'pengingat', options: [{ name, ...(value ? { options: [{ name: 'channel', value }] } : {}) }] }] } });
function enableReminder() { store.sqlite.prepare('INSERT INTO discord_reminders(guild_id,channel_id,enabled,updated_by,updated_at) VALUES (?,?,1,?,?)').run(guildId, channelId, alice, now.getTime()); }
function semanticDaily() { store.sqlite.prepare('UPDATE daily SET demo=0').run(); }
function delivery() { return store.sqlite.prepare('SELECT * FROM discord_deliveries').get() as any; }
describe('Discord identity and Activity API', () => {
  it('authenticates without a cookie, stores only hashed application sessions and resumes across devices', async () => {
    const first = await login(); expect(first.response.status).toBe(200); expect(first.response.headers.get('set-cookie')).toBeNull();
    expect(first.data.accessToken).toBe('oauth-token');
    expect(JSON.stringify(store.sqlite.prepare('SELECT * FROM discord_sessions').all())).not.toContain(first.data.sessionToken);
    const run = (await api('/runs', first.data.sessionToken, {})).data;
    await api(`/runs/${run.id}/answers`, first.data.sessionToken, { stage: 0, word: 'restoran' });
    const second = await login();
    const resumed = await api('/daily', second.data.sessionToken);
    expect(resumed.data.run).toMatchObject({ id: run.id, total: 1000 });
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM discord_identities').get()).toEqual({ n: 1 });
    expect((await api(`/runs/${run.id}/answers`, second.data.sessionToken, { stage: 0, skip: true })).data.total).toBe(1000);
    expect(JSON.stringify(resumed.data)).not.toContain('payung');
  });
  it('keeps browser guests separate and never falls back to a guest for an expired bearer', async () => {
    const { data } = await login();
    const guest = await app.request('https://nyambung.example/api/runs', { method: 'POST' });
    const guestRun = await guest.json();
    expect((await api(`/runs/${guestRun.id}`, data.sessionToken)).status).toBe(404);
    now = new Date(now.getTime() + 3600001);
    const expired = await api('/daily', data.sessionToken);
    expect(expired.status).toBe(401);
    expect((await api('/daily', 'a'.repeat(64))).status).toBe(401);
  });
  it('consumes one-use bootstrap challenges and rejects foreign or missing origins', async () => {
    const bootstrap = service.bootstrap();
    await service.authenticate({ code: 'code', nonce: bootstrap.nonce, instanceId: 'room-one' });
    await expect(service.authenticate({ code: 'code', nonce: bootstrap.nonce, instanceId: 'room-one' })).rejects.toMatchObject({ status: 401 });
    for (const origin of [undefined, 'https://evil.example', `https://${appId}.discordsays.com.evil.example`]) {
      const response = await app.request('https://nyambung.example/api/discord/auth', { method: 'POST', headers: origin ? { Origin: origin } : {}, body: '{}' });
      expect(response.status).toBe(403);
    }
  });
  it('validates the OAuth application, participant and beta server before creating an identity', async () => {
    users = [bob]; expect((await login()).response.status).toBe(403);
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM discord_identities').get()).toEqual({ n: 0 });
    users = [alice];
    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({ access_token: 'oauth-token', expires_in: 3600 })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ application: { id: bob }, scopes: ['identify'] })));
    expect((await login()).response.status).toBe(401);
    fetcher.mockImplementation(async (input, init) => String(input).includes('/activity-instances/') ? new Response(JSON.stringify({ application_id: appId, instance_id: 'room-one', location: { guild_id: bob }, users: [alice] })) : remote(input, init));
    expect((await login()).response.status).toBe(403);
  });
  it('shares counts and completed totals only; protects room membership and separate runs', async () => {
    const a = (await login(alice)).data, b = (await login(bob)).data;
    const ar = (await api('/runs', a.sessionToken, {})).data, br = (await api('/runs', b.sessionToken, {})).data;
    expect(ar.id).not.toBe(br.id);
    await api(`/runs/${ar.id}/answers`, a.sessionToken, { stage: 0, word: 'restoran' });
    let room = await api('/discord/instances/room-one/progress', b.sessionToken);
    expect(room.data.participants.find((p: any) => p.id === alice)).toMatchObject({ stages: 1, total: null, completed: false });
    expect(JSON.stringify(room.data)).not.toMatch(/restoran|makanan|best|connections|player_id|sessionToken/);
    for (let stage = 1; stage < 5; stage++) await api(`/runs/${ar.id}/answers`, a.sessionToken, { stage, skip: true });
    room = await api('/discord/instances/room-one/progress', b.sessionToken);
    expect(room.data.participants.find((p: any) => p.id === alice)).toMatchObject({ stages: 5, total: 1000, completed: true });
    expect((await api('/discord/instances/other-room/progress', b.sessionToken)).status).toBe(403);
    users = [alice]; now = new Date(now.getTime() + 6000);
    expect((await api('/discord/instances/room-one/progress', b.sessionToken)).status).toBe(403);
    expect((await app.request('https://nyambung.example/api/discord/instances/room-one/progress')).status).toBe(401);
  });
  it('preserves an unfinished run over midnight while room progress moves to the new daily', async () => {
    now = new Date('2026-10-22T16:55:00Z');
    const token = (await login()).data.sessionToken;
    const run = (await api('/runs', token, {})).data;
    now = new Date('2026-10-22T17:01:00Z');
    expect((await api(`/runs/${run.id}/answers`, token, { stage: 0, word: 'restoran' })).data.date).toBe('2026-10-22');
    const room = await api('/discord/instances/room-one/progress', token);
    expect(room.data.date).toBe('2026-10-23'); expect(room.data.participants[0].stages).toBe(0);
  });
});
describe('signed HTTP interactions', () => {
  it('answers PING without cookies and launches from slash commands or Play Now', async () => {
    const ping = await interact({ type: 1 }); expect(ping.data).toEqual({ type: 1 }); expect(ping.response.headers.get('set-cookie')).toBeNull();
    expect((await interact()).data).toEqual({ type: 12 });
    expect((await interact({ type: 3, data: { custom_id: 'nyambung:daily:2026-10-22' } })).data).toEqual({ type: 12 });
  });
  it('rejects unsigned, modified, stale, and wrong-server requests', async () => {
    expect((await app.request('https://nyambung.example/api/discord/interactions', { method: 'POST', body: '{}' })).status).toBe(401);
    const valid = await interact();
    expect((await app.request('https://nyambung.example/api/discord/interactions', { method: 'POST', headers: valid.headers, body: valid.raw + ' ' })).status).toBe(401);
    expect((await interact({}, Math.floor(now.getTime() / 1000 - 301).toString())).response.status).toBe(401);
    expect((await interact({ guild_id: bob })).data.data.content).toContain('beta');
    expect((await app.request('https://nyambung.example/api/discord/interactions', { method: 'POST', headers: { 'Content-Length': '70000' }, body: 'x'.repeat(70000) })).status).toBe(413);
  });
  it('requires Manage Server and validates channel permissions before enabling reminders', async () => {
    const denied = await interact({ ...reminderCommand('atur', channelId), member: { permissions: '0', user: { id: alice } } });
    expect(denied.data.data.content).toContain('Manage Server');
    expect((await interact(reminderCommand('atur', channelId))).data.type).toBe(5);
    await bot.drain();
    expect(store.sqlite.prepare('SELECT enabled,channel_id FROM discord_reminders').get()).toEqual({ enabled: 1, channel_id: channelId });
    expect((await interact(reminderCommand('status'))).data.data.content).toContain('00.05 WIB');
    await interact(reminderCommand('matikan'));
    expect(store.sqlite.prepare('SELECT enabled FROM discord_reminders').get()).toEqual({ enabled: 0 });
  });
  it('deduplicates replayed interactions, including test-message side effects', async () => {
    enableReminder(); semanticDaily();
    const first = await interact(reminderCommand('tes')); await bot.drain();
    await app.request('https://nyambung.example/api/discord/interactions', { method: 'POST', headers: first.headers, body: first.raw }); await bot.drain();
    expect(sent).toHaveLength(1); expect(sent[0].content).toContain('Contoh'); expect(delivery()).toBeUndefined();
  });
  it('does not save a channel where permission overwrites block the bot', async () => {
    fetcher.mockImplementation(async (input, init) => String(input).endsWith(`/channels/${channelId}`) ? Response.json({ guild_id: guildId, type: 0, permission_overwrites: [{ id: guildId, type: 0, allow: '0', deny: '2048' }] }) : remote(input, init));
    await interact(reminderCommand('atur', channelId)); await bot.drain();
    expect(store.sqlite.prepare('SELECT * FROM discord_reminders').all()).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});
describe('persistent daily scheduler', () => {
  it('sends once at 00.05 WIB and survives worker restart and concurrent ticks', async () => {
    enableReminder(); semanticDaily(); now = new Date('2026-10-21T17:04:00Z');
    await bot.tick(); expect(sent).toHaveLength(0);
    now = new Date('2026-10-21T17:05:00Z');
    await Promise.all([bot.tick(), bot.tick()]);
    await createDiscordBot(store, service, () => now).tick();
    expect(sent).toHaveLength(1); expect(delivery().status).toBe('sent');
    expect(sent[0]).toMatchObject({ ...reminderMessage('2026-10-22', 1), enforce_nonce: true });
    expect(sent[0].allowed_mentions.parse).toEqual([]);
    expect(JSON.stringify(sent[0])).not.toContain('restoran');
  });
  it('does not announce missing/demo puzzles or catch up after 02.00 WIB', async () => {
    enableReminder(); await bot.tick(); expect(sent).toHaveLength(0);
    semanticDaily(); now = new Date('2026-10-21T19:00:00Z'); await bot.tick(); expect(sent).toHaveLength(0);
    now = new Date('2027-01-01T17:05:00Z'); await bot.tick(); expect(sent).toHaveLength(0);
  });
  it('reconciles a timeout after Discord accepted the message instead of posting twice', async () => {
    enableReminder(); semanticDaily(); timeoutAfterSend = true;
    await bot.tick(); expect(delivery().status).toBe('uncertain'); expect(sent).toHaveLength(1);
    now = new Date(now.getTime() + 61000);
    await createDiscordBot(store, service, () => now).tick();
    expect(delivery().status).toBe('sent'); expect(sent).toHaveLength(1);
  });
  it('never resends if history cannot be checked', async () => {
    enableReminder(); semanticDaily(); timeoutAfterSend = true; await bot.tick();
    historyFailure = true; now = new Date(now.getTime() + 61000); await bot.tick();
    expect(sent).toHaveLength(1); expect(delivery().status).toBe('blocked');
    expect(store.sqlite.prepare('SELECT enabled FROM discord_reminders').get()).toEqual({ enabled: 0 });
  });
  it('recovers a process crash after posting once the persisted sending lease expires', async () => {
    enableReminder(); semanticDaily(); timeoutAfterSend = true; await bot.tick();
    store.sqlite.prepare('UPDATE discord_deliveries SET lease_until=?').run(now.getTime() + 180000);
    const restarted = createDiscordBot(store, service, () => now);
    now = new Date(now.getTime() + 61000); await restarted.tick(); expect(delivery().status).toBe('uncertain');
    now = new Date(now.getTime() + 121000); await restarted.tick();
    expect(delivery().status).toBe('sent'); expect(sent).toHaveLength(1);
  });
  it('ignores example messages when reconciling a failed daily POST', async () => {
    enableReminder(); semanticDaily(); await interact(reminderCommand('tes')); await bot.drain();
    let disconnected = false;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/messages') && init?.method === 'POST' && !disconnected) { disconnected = true; throw new Error('not delivered'); }
      return remote(input, init);
    });
    await bot.tick(); expect(delivery().status).toBe('uncertain');
    now = new Date(now.getTime() + 61000); await bot.tick();
    expect(sent).toHaveLength(2); expect(sent[0].content).toContain('Contoh'); expect(sent[1].content).not.toContain('Contoh'); expect(delivery().status).toBe('sent');
  });
  it('can reenable a failed delivery after fixing channel permissions', async () => {
    enableReminder(); semanticDaily(); postFailure = 403; await bot.tick();
    expect(delivery().status).toBe('failed');
    postFailure = 0; await interact(reminderCommand('atur', channelId)); await bot.drain();
    expect(delivery().status).toBe('pending'); await bot.tick(); expect(sent).toHaveLength(1);
  });
  it('honors rate limits and disables reminders on revoked permissions without breaking gameplay', async () => {
    enableReminder(); semanticDaily(); postFailure = 429; await bot.tick();
    const calls = fetcher.mock.calls.length; await bot.tick(); expect(fetcher.mock.calls).toHaveLength(calls);
    postFailure = 0; now = new Date(now.getTime() + 61000); await bot.tick(); expect(sent).toHaveLength(1);
    store.sqlite.prepare('DELETE FROM discord_deliveries').run(); postFailure = 403; await bot.tick();
    expect(delivery().status).toBe('failed'); expect((await app.request('https://nyambung.example/api/daily')).status).toBe(200);
  });
});

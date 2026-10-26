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
let messageSequence=1555555555555555555n;
const remote = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input)), path = url.pathname.replace('/api/v10', '');
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (path === '/oauth2/token') return response({ access_token: 'oauth-token', expires_in: 7200 });
  if (path === '/oauth2/@me') return response({ application: { id: appId }, scopes: ['identify', 'rpc.activities.write'] });
  if (path === '/users/@me') return response({ id: (init?.headers as any)?.Authorization === 'Bearer oauth-token' ? authenticatedUser : botId, username: authenticatedUser === alice ? 'Alice' : 'Bob', avatar: null });
  if (path.includes('/activity-instances/')) return response({ application_id: appId, instance_id: path.split('/').at(-1), location: { guild_id: guildId, channel_id:channelId }, users });
  if (path === `/channels/${channelId}`) return response({ guild_id: guildId, type: 0, permission_overwrites: [] });
  if (path.endsWith(`/members/${botId}`)) return response({ roles: [] });
  if (path.endsWith('/roles')) return response([{ id: guildId, permissions: String(1024 + 2048 + 65536) }]);
  if (path.includes('/webhooks/')) return response({});
  if (/^\/channels\/\d+\/messages\/\d+$/.test(path) && init?.method === 'PATCH') {
    const message=messages.find(item=>item.id===path.split('/').at(-1));
    if(!message)return response({},404);
    Object.assign(message,JSON.parse(init.body instanceof FormData ? String(init.body.get('payload_json')) : init.body as string));return response(message);
  }
  if (/^\/channels\/\d+\/messages$/.test(path)) {
    if (init?.method === 'POST') {
      if (postFailure) return response({ retry_after: 10 }, postFailure);
      const body = JSON.parse(init.body instanceof FormData ? String(init.body.get('payload_json')) : init.body as string); sent.push(body);
      const message = { ...body, id: String(messageSequence++), channelId:path.split('/')[2], author: { id: botId,bot:true } }; messages.unshift(message);
      if (timeoutAfterSend) { timeoutAfterSend = false; throw new Error('socket closed after accepting'); }
      return response(message);
    }
    if (historyFailure) return response({}, 403);
    const after=url.searchParams.get('after');
    return response(messages.filter(message=>(!message.channelId||message.channelId===path.split('/')[2])&&(!after||BigInt(message.id)>BigInt(after))));
  }
  throw new Error(`Unmocked Discord path ${path}`);
};
beforeEach(() => {
  messageSequence=1555555555555555555n;
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

describe('channel Activity status, leaderboard and recap', () => {
  async function startPlayer(user=alice) {
    const auth=(await login(user)).data;
    const run=(await api('/runs',auth.sessionToken,{})).data;
    return {auth,run};
  }
  async function heartbeat(auth:any,runId:string) {
    return api(`/discord/instances/room-one/progress?runId=${runId}`,auth.sessionToken);
  }
  async function finish(auth:any,runId:string) {
    await api(`/runs/${runId}/answers`,auth.sessionToken,{stage:0,word:'restoran'});
    for(let stage=1;stage<5;stage++)await api(`/runs/${runId}/answers`,auth.sessionToken,{stage,skip:true});
  }
  function realDaily(){store.sqlite.exec('UPDATE daily SET demo=0; UPDATE puzzle_versions SET demo=0;');}
  it('binds presence and run membership to the verified channel and player', async () => {
    const a=await startPlayer(),b=await startPlayer(bob);
    expect((await heartbeat(a.auth,b.run.id)).status).toBe(404);
    expect(store.sqlite.prepare('SELECT * FROM discord_channel_runs').all()).toEqual([]);
    expect((await api(`/discord/instances/room-one/progress?runId=${a.run.id}&channelId=${bob}`,a.auth.sessionToken)).status).toBe(200);
    expect(store.sqlite.prepare('SELECT channel_id,run_id FROM discord_activity_players').get()).toEqual({channel_id:channelId,run_id:a.run.id});
    users=[bob];now=new Date(now.getTime()+6000);
    expect((await heartbeat(a.auth,a.run.id)).status).toBe(403);
  });
  it('posts one status message, edits progress, hides partial scores and expires inactive players', async () => {
    const a=await startPlayer();realDaily();
    await heartbeat(a.auth,a.run.id);await Promise.all([bot.reports.tick(),createDiscordBot(store,service,()=>now).reports.tick()]);
    expect(sent).toHaveLength(1);expect(sent[0].content).toContain('Babak 1/5');
    const upload=fetcher.mock.calls.find(([,init])=>init?.body instanceof FormData)![1]!.body as FormData;
    const png=upload.get('files[0]') as File;
    expect(png.type).toBe('image/png');expect(Buffer.from(await png.arrayBuffer()).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(sent[0].attachments).toHaveLength(1);expect(sent[0].components[0].components[0]).toMatchObject({label:'Play',custom_id:'nyambung:play'});

    await api(`/runs/${a.run.id}/answers`,a.auth.sessionToken,{stage:0,word:'restoran'});
    now=new Date(now.getTime()+31000);await heartbeat(a.auth,a.run.id);await bot.reports.tick();
    expect(sent).toHaveLength(1);expect(messages[0].content).toContain('Babak 2/5');
    expect(messages[0].content).not.toContain('1.000');
    expect(bot.reports.cardData(channelId,new Date(now.getTime()+7*3600000).toISOString().slice(0,10)).players[0].stageScores).toBeUndefined();
    for(let stage=1;stage<5;stage++)await api(`/runs/${a.run.id}/answers`,a.auth.sessionToken,{stage,skip:true});
    now=new Date(now.getTime()+31000);await heartbeat(a.auth,a.run.id);await bot.reports.tick();
    expect(messages[0].content).toContain('Selesai');expect(messages[0].content).toContain('1.000 poin');
    expect(bot.reports.cardData(channelId,new Date(now.getTime()+7*3600000).toISOString().slice(0,10)).players[0].stageScores).toEqual([1000,0,0,0,0]);
    expect(messages[0].allowed_mentions).toEqual({parse:[]});
    expect(JSON.stringify(messages)).not.toMatch(/restoran|makanan|best|connections|sessionToken/);
    now=new Date(now.getTime()+91000);await bot.reports.tick();
    expect(messages[0].content).toContain('Sedang main · 0 pemain');
    expect(messages[0].content).toContain('1.000 poin');
    expect(bot.reports.cardData(channelId,new Date(now.getTime()+7*3600000).toISOString().slice(0,10)).players[0].stageScores).toEqual([1000,0,0,0,0]);
    await createDiscordBot(store,service,()=>now).reports.tick();expect(sent).toHaveLength(1);
  });
  it('isolates rankings by channel, excludes demo and random runs, and ranks ties equally', async () => {
    const a=await startPlayer(),b=await startPlayer(bob);
    await heartbeat(a.auth,a.run.id);await finish(a.auth,a.run.id);
    expect(bot.reports.leaderboard(channelId)).not.toContain('1.000');
    realDaily();await heartbeat(b.auth,b.run.id);await finish(b.auth,b.run.id);
    expect(bot.reports.leaderboard(channelId)).toContain(`1. <@${alice}>`);
    expect(bot.reports.leaderboard(channelId)).toContain(`1. <@${bob}>`);
    expect(bot.reports.leaderboard(botId)).not.toContain('1.000');
    store.sqlite.prepare("UPDATE runs SET mode='random' WHERE id=?").run(a.run.id);
    expect(bot.reports.leaderboard(channelId)).not.toContain(alice);
    expect(bot.reports.leaderboard(channelId)).toContain(bob);
    const response=await interact({channel_id:channelId,member:{permissions:'0',user:{id:alice}},data:{name:'nyambung',options:[{name:'leaderboard'}]}});
    expect(response.data.type).toBe(4);expect(response.data.data.flags).toBeUndefined();expect(response.data.data.allowed_mentions.parse).toEqual([]);
  });
  it('shows server-wide completed scores across channels without leaking answers or other guilds', async () => {
    const a=await startPlayer(),b=await startPlayer(bob);realDaily();
    await heartbeat(a.auth,a.run.id);await heartbeat(b.auth,b.run.id);
    expect((await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken)).status).toBe(403);
    await finish(a.auth,a.run.id);
    let response=await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken);
    expect(response.data.totalPlayers).toBe(1);expect(response.data.players[0]).toMatchObject({id:alice,name:'Alice',score:1000,rank:1});
    expect(JSON.stringify(response.data)).not.toMatch(/restoran|makanan|best|connections|word|clues|sessionToken|player_id/);
    expect((await api(`/discord/scores/${a.run.id}`,b.auth.sessionToken)).status).toBe(403);
    await finish(b.auth,b.run.id);
    store.sqlite.prepare('UPDATE discord_channel_runs SET channel_id=? WHERE discord_id=?').run(botId,bob);
    response=await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken);
    expect(response.data.totalPlayers).toBe(2);expect(response.data.players.map((p:any)=>p.rank)).toEqual([1,1]);
    store.sqlite.prepare('INSERT INTO discord_channel_runs VALUES (?,?,?,?,?)').run(botId,a.run.id,guildId,alice,now.getTime());
    expect((await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken)).data.totalPlayers).toBe(2);
    store.sqlite.prepare('UPDATE discord_channel_runs SET guild_id=? WHERE discord_id=?').run(botId,bob);
    expect((await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken)).data.totalPlayers).toBe(1);
    expect((await app.request(`https://nyambung.example/api/discord/scores/${a.run.id}`)).status).toBe(401);
    users=[bob];now=new Date(now.getTime()+6000);
    expect((await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken)).status).toBe(403);
  });
  it('sends yesterday recap once after 00.05 WIB and freezes results against archive completions', async () => {
    const a=await startPlayer(),b=await startPlayer(bob);realDaily();
    await heartbeat(a.auth,a.run.id);await heartbeat(b.auth,b.run.id);await finish(a.auth,a.run.id);
    now=new Date('2026-10-22T17:04:00Z');await bot.reports.tick();
    expect(sent.filter(m=>m.content.includes('Recap Daily'))).toHaveLength(0);
    // Finishing yesterday after midnight must not change its final standings.
    await finish(b.auth,b.run.id);
    now=new Date('2026-10-22T17:05:00Z');await bot.reports.tick();
    const recaps=sent.filter(m=>m.content.includes('Recap Daily'));expect(recaps).toHaveLength(1);
    expect(recaps[0].content).toContain('2 pemain · 1 selesai · 1 belum selesai');
    expect(recaps[0].content).toContain(alice);expect(recaps[0].content).not.toContain(bob);
    now=new Date(now.getTime()+61000);await createDiscordBot(store,service,()=>now).reports.tick();
    expect(sent.filter(m=>m.content.includes('Recap Daily'))).toHaveLength(1);
    const response=await interact({channel_id:channelId,data:{name:'nyambung',options:[{name:'recap'}]}});
    expect(response.data.data.content).toContain('2 pemain · 1 selesai');
  });
  it('reconciles ambiguous report sends across restarts and honors rate limits', async () => {
    const a=await startPlayer();await heartbeat(a.auth,a.run.id);
    timeoutAfterSend=true;await bot.reports.tick();expect(sent).toHaveLength(1);
    now=new Date(now.getTime()+61000);await createDiscordBot(store,service,()=>now).reports.tick();
    expect(sent).toHaveLength(1);expect(store.sqlite.prepare("SELECT message_id,uncertain FROM discord_channel_cards WHERE kind='live'").get()).toMatchObject({message_id:messages[0].id,uncertain:0});
    // Deletion followed by rate limiting must back off without disturbing play.
    messages=[];now=new Date(now.getTime()+91000);postFailure=429;await bot.reports.tick();
    const calls=fetcher.mock.calls.length;await bot.reports.tick();expect(fetcher.mock.calls).toHaveLength(calls);
    postFailure=0;now=new Date(now.getTime()+61000);await bot.reports.tick();expect(sent).toHaveLength(2);
    expect((await api('/daily',a.auth.sessionToken)).status).toBe(200);
  });
  it('reuses the same channel card after midnight and across repeated launches', async () => {
    const a=await startPlayer();await heartbeat(a.auth,a.run.id);await bot.reports.tick();
    const messageId=messages[0].id;
    for(let launch=0;launch<3;launch++)expect((await interact()).data).toEqual({type:12});
    now=new Date('2026-10-25T17:05:00Z');await bot.reports.tick();
    expect(sent).toHaveLength(1);expect(messages[0].id).toBe(messageId);
    expect(messages[0].content).toContain('Sedang main · 0 pemain');
    expect(store.sqlite.prepare('SELECT date,message_id FROM discord_channel_cards').get()).toEqual({date:'2026-10-26',message_id:messageId});
    expect(messages[0].components[0].components[0]).toMatchObject({label:'Play',custom_id:'nyambung:play'});
    expect((await interact({type:3,data:{custom_id:'nyambung:play'}})).data).toEqual({type:12});
    expect((await interact({data:{name:'launch',type:4}})).data).toEqual({type:12});
    await bot.reports.tick();expect(sent).toHaveLength(1);
  });
  it('resurfaces a buried card for a new player, with a cooldown and exact-revision retry',async()=>{
    const a=await startPlayer();await heartbeat(a.auth,a.run.id);await bot.reports.tick();
    const first=messages[0].id;
    const addChat=(count:number)=>{for(let n=0;n<count;n++)messages.unshift({id:String(messageSequence++),channelId:channelId,content:'chat',author:{id:bob,bot:false}});};
    addChat(8);
    // A progress update does not bump the card, even in a busy channel.
    now=new Date(now.getTime()+610000);await heartbeat(a.auth,a.run.id);await bot.reports.tick();expect(sent).toHaveLength(1);
    const b=await startPlayer(bob);await heartbeat(b.auth,b.run.id);now=new Date(now.getTime()+31000);
    timeoutAfterSend=true;await bot.reports.tick();expect(sent).toHaveLength(2);
    const pending=store.sqlite.prepare('SELECT revision,message_id,uncertain FROM discord_channel_cards').get();
    expect(pending).toEqual({revision:1,message_id:null,uncertain:1});
    now=new Date(now.getTime()+61000);await createDiscordBot(store,service,()=>now).reports.tick();
    const recovered=store.sqlite.prepare('SELECT revision,message_id,uncertain FROM discord_channel_cards').get() as any;
    expect(recovered.revision).toBe(1);expect(recovered.message_id).not.toBe(first);expect(recovered.uncertain).toBe(0);expect(sent).toHaveLength(2);
    // A rejoining player and eight new chats inside the cooldown only edit.
    store.sqlite.prepare('DELETE FROM discord_activity_players WHERE discord_id=?').run(alice);
    now=new Date(now.getTime()+91000);await heartbeat(b.auth,b.run.id);await bot.reports.tick();
    addChat(8);await heartbeat(a.auth,a.run.id);now=new Date(now.getTime()+31000);await bot.reports.tick();expect(sent).toHaveLength(2);
  });
  it('keeps a recent or unburied card in place when players join',async()=>{
    const a=await startPlayer();await heartbeat(a.auth,a.run.id);await bot.reports.tick();
    now=new Date(now.getTime()+610000);const b=await startPlayer(bob);await heartbeat(b.auth,b.run.id);await bot.reports.tick();
    expect(sent).toHaveLength(1);expect(store.sqlite.prepare('SELECT revision FROM discord_channel_cards').get()).toEqual({revision:0});
  });
  it('does not resend an uncertain report when history permission is lost', async () => {
    const a=await startPlayer();await heartbeat(a.auth,a.run.id);timeoutAfterSend=true;await bot.reports.tick();
    now=new Date(now.getTime()+61000);historyFailure=true;await createDiscordBot(store,service,()=>now).reports.tick();
    expect(sent).toHaveLength(1);expect(store.sqlite.prepare("SELECT uncertain,last_error FROM discord_channel_cards WHERE kind='live'").get()).toMatchObject({uncertain:1,last_error:'Discord HTTP 403'});
  });
});

describe('multiple allowed Discord servers',()=>{
  const friendGuild='777777777777777777',friendChannel='888888888888888888';
  function allowFriend(){
    config.guildIds=[guildId,friendGuild];
    fetcher.mockImplementation(async(input,init)=>{
      const path=new URL(String(input)).pathname.replace('/api/v10','');
      if(path.includes('/activity-instances/friend-room'))return Response.json({application_id:appId,instance_id:'friend-room',location:{guild_id:friendGuild,channel_id:friendChannel},users});
      if(path===`/channels/${friendChannel}`)return Response.json({guild_id:friendGuild,type:0,permission_overwrites:[]});
      if(path===`/guilds/${friendGuild}/roles`)return Response.json([{id:friendGuild,permissions:String(1024+2048+65536)}]);
      return remote(input,init);
    });
    bot=createDiscordBot(store,service,()=>now);app=createApp(store,()=>now,{discord:service,bot});
  }
  async function play(user:string,room:string){
    const auth=(await login(user,room)).data;expect(auth.sessionToken).toBeTruthy();
    const run=(await api('/runs',auth.sessionToken,{})).data;
    expect((await api(`/discord/instances/${room}/progress?runId=${run.id}`,auth.sessionToken)).status).toBe(200);
    for(let stage=0;stage<5;stage++)await api(`/runs/${run.id}/answers`,auth.sessionToken,{stage,skip:true});
    return {auth,run};
  }
  it('accepts both servers and isolates presence, result scores, channel posts and recap',async()=>{
    allowFriend();
    const a=await play(alice,'room-one'),b=await play(bob,'friend-room');
    store.sqlite.exec('UPDATE daily SET demo=0;UPDATE puzzle_versions SET demo=0;');
    expect(store.sqlite.prepare('SELECT guild_id,channel_id FROM discord_activity_players ORDER BY guild_id').all()).toEqual([{guild_id:guildId,channel_id:channelId},{guild_id:friendGuild,channel_id:friendChannel}]);
    const aScores=await api(`/discord/scores/${a.run.id}`,a.auth.sessionToken),bScores=await api(`/discord/scores/${b.run.id}`,b.auth.sessionToken);
    expect(aScores.data.players.map((p:any)=>p.id)).toEqual([alice]);expect(bScores.data.players.map((p:any)=>p.id)).toEqual([bob]);
    expect((await api('/discord/instances/friend-room/progress',a.auth.sessionToken)).status).toBe(403);
    expect((await interact({guild_id:friendGuild})).data).toEqual({type:12});
    const ranks=await interact({guild_id:friendGuild,channel_id:friendChannel,data:{name:'nyambung',options:[{name:'leaderboard'}]}});
    expect(ranks.data.data.content).toContain(bob);expect(ranks.data.data.content).not.toContain(alice);
    await bot.reports.tick();
    expect(messages.find(m=>m.channelId===channelId).content).toContain(alice);expect(messages.find(m=>m.channelId===channelId).content).not.toContain(bob);
    expect(messages.find(m=>m.channelId===friendChannel).content).toContain(bob);expect(messages.find(m=>m.channelId===friendChannel).content).not.toContain(alice);
    now=new Date('2026-10-22T17:05:00Z');await bot.reports.tick();
    const recaps=messages.filter(m=>m.content.includes('Recap Daily'));expect(recaps).toHaveLength(2);
    expect(recaps.find(m=>m.channelId===channelId).content).not.toContain(bob);expect(recaps.find(m=>m.channelId===friendChannel).content).not.toContain(alice);
  });
  it('configures and schedules reminders separately, rejecting channels from another server',async()=>{
    allowFriend();enableReminder();semanticDaily();
    await interact({guild_id:friendGuild,...reminderCommand('atur',friendChannel)});await bot.drain();
    expect(store.sqlite.prepare('SELECT guild_id,channel_id FROM discord_reminders ORDER BY guild_id').all()).toEqual([{guild_id:guildId,channel_id:channelId},{guild_id:friendGuild,channel_id:friendChannel}]);
    await interact(reminderCommand('atur',friendChannel));await bot.drain();
    expect(store.sqlite.prepare('SELECT channel_id FROM discord_reminders WHERE guild_id=?').get(guildId)).toEqual({channel_id:channelId});
    await bot.tick();expect(messages).toHaveLength(2);expect(new Set(messages.map(m=>m.channelId))).toEqual(new Set([channelId,friendChannel]));
    await interact({guild_id:friendGuild,...reminderCommand('matikan')});
    expect(store.sqlite.prepare('SELECT enabled FROM discord_reminders WHERE guild_id=?').get(friendGuild)).toEqual({enabled:0});
    expect(store.sqlite.prepare('SELECT enabled FROM discord_reminders WHERE guild_id=?').get(guildId)).toEqual({enabled:1});
    expect((await interact({guild_id:botId})).data.data.content).toContain('beta');
  });
});

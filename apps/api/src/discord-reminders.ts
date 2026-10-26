import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db.js';
import { DiscordHttpError, discordGuildIds, type DiscordService } from './discord.js';
import { wibDate } from './time.js';
import { createDiscordReports } from './discord-reports.js';

const id = z.string().regex(/^\d{5,24}$/);
const option: z.ZodType<CommandOption> = z.lazy(() => z.object({ name: z.string(), value: z.union([z.string(), z.number()]).optional(), options: z.array(option).optional() }));
interface CommandOption { name: string; value?: string | number; options?: CommandOption[] }
const interaction = z.object({ id, application_id: id, type: z.number(), token: z.string().optional(), guild_id: id.optional(), channel_id: id.optional(), member: z.object({ permissions: z.string().optional(), user: z.object({ id }) }).optional(), data: z.object({ name: z.string().optional(), type:z.number().optional(), custom_id: z.string().optional(), options: z.array(option).optional() }).optional() });
const reply = (content: string) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
export const discordCommands = [{ name: 'nyambung', description: 'Main Nyambung dan atur pengingat daily', type: 1, options: [
  { name: 'main', description: 'Buka Nyambung', type: 1 },
  { name: 'leaderboard', description: 'Skor Daily yang sudah selesai di channel ini', type: 1 },
  { name: 'recap', description: 'Recap Daily kemarin di channel ini', type: 1 },
  { name: 'pengingat', description: 'Pengingat daily untuk server ini (Manage Server)', type: 2, options: [
    { name: 'atur', description: 'Kirim daily pukul 00.05 WIB', type: 1, options: [{ name: 'channel', description: 'Channel untuk pengingat', type: 7, required: true, channel_types: [0, 5] }] },
    { name: 'status', description: 'Lihat pengaturan pengingat', type: 1 },
    { name: 'matikan', description: 'Matikan pengingat', type: 1 },
    { name: 'tes', description: 'Kirim contoh pengingat ke channel tersimpan', type: 1 },
  ] },
] }];
export function reminderMessage(date: string, number: number, test = false) {
  return { content: `${test ? '**Contoh pengingat**\n' : ''}**Nyambung · Daily #${String(number).padStart(3, '0')}**\n${date}`, allowed_mentions: { parse: [] }, components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Play Now', custom_id: `nyambung:daily${test ? '-test' : ''}:${date}` }] }] };
}
interface Reminder { guild_id: string; channel_id: string; enabled: number; last_error: string | null }
interface Delivery { guild_id: string; date: string; channel_id: string; status: string; attempts: number }
interface Message { id: string; author: { id: string }; components?: { components?: { custom_id?: string }[] }[] }
export function createDiscordBot(store: Store, discord: DiscordService, clock: () => Date = () => new Date()) {
  const bots=new Map(discordGuildIds(discord.config).map(guildId=>[guildId,createGuildDiscordBot(store,{...discord,config:{...discord.config,guildId,guildIds:[guildId]}},clock)]));
  const first=bots.values().next().value!;
  return {
    handle:(input:unknown)=>{const parsed=interaction.safeParse(input);return (parsed.success&&parsed.data.guild_id?bots.get(parsed.data.guild_id)??first:first).handle(input);},
    tick:async()=>{await Promise.all([...bots.values()].map(bot=>bot.tick()));},
    reports:{...first.reports,tick:async()=>{await Promise.all([...bots.values()].map(bot=>bot.reports.tick()));}},
    start:()=>{const stops=[...bots.values()].map(bot=>bot.start());return async()=>{await Promise.all(stops.map(stop=>stop()));};},
    drain:async()=>{await Promise.all([...bots.values()].map(bot=>bot.drain()));},
  };
}
function createGuildDiscordBot(store: Store, discord: DiscordService, clock: () => Date) {
  const { client, config } = discord;
  const reports = createDiscordReports(store, discord, clock);
  const tasks = new Set<Promise<void>>();
  let ticking = false;
  const botId = () => client.request<{ id: string }>('/users/@me');
  async function validateChannel(channelId: string) {
    const channel = await client.request<{ guild_id: string; type: number; permission_overwrites: { id: string; type: number; allow: string; deny: string }[] }>(`/channels/${channelId}`);
    if (channel.guild_id !== config.guildId || ![0, 5].includes(channel.type)) throw new Error('Pilih channel teks di server beta.');
    const bot = await botId();
    const member = await client.request<{ roles: string[] }>(`/guilds/${config.guildId}/members/${bot.id}`);
    const roles = await client.request<{ id: string; permissions: string }[]>(`/guilds/${config.guildId}/roles`);
    const roleIds = new Set([config.guildId, ...member.roles]);
    let permissions = roles.filter(role => roleIds.has(role.id)).reduce((value, role) => value | BigInt(role.permissions), 0n);
    if (!(permissions & 8n)) {
      const overwrites = channel.permission_overwrites || [];
      const everyone = overwrites.find(item => item.id === config.guildId && item.type === 0);
      if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
      const applicable = overwrites.filter(item => item.type === 0 && item.id !== config.guildId && roleIds.has(item.id));
      const deny = applicable.reduce((v, item) => v | BigInt(item.deny), 0n), allow = applicable.reduce((v, item) => v | BigInt(item.allow), 0n);
      permissions = (permissions & ~deny) | allow;
      const own = overwrites.find(item => item.id === bot.id && item.type === 1);
      if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
      const required = 1024n | 2048n | 65536n;
      if ((permissions & required) !== required) throw new Error('Bot membutuhkan View Channel, Send Messages, dan Read Message History di channel ini.');
    }
  }
  function defer(task: () => Promise<void>) {
    const pending = Promise.resolve().then(task).catch(() => { console.error('Tugas Discord gagal; periksa izin atau koneksi Discord.'); }).finally(() => tasks.delete(pending));
    tasks.add(pending);
  }
  async function handle(input: unknown) {
    const parsed = interaction.safeParse(input);
    if (!parsed.success || parsed.data.application_id !== config.applicationId) return reply('Interaction tidak valid.');
    const data = parsed.data;
    if (data.type === 1) return { type: 1 };
    if (data.guild_id !== config.guildId) return reply('Nyambung saat ini hanya tersedia di server beta.');
    const cached = store.sqlite.prepare('SELECT reply FROM discord_interactions WHERE id=?').get(data.id) as { reply: string } | undefined;
    if (cached) return JSON.parse(cached.reply);
    const group = data.data?.options?.[0];
    const action = group?.options?.[0];
    let response: object;
    let work: (() => Promise<void>) | undefined;
    if (data.type === 3 && (data.data?.custom_id==='nyambung:play' || /^nyambung:daily(?:-test)?:\d{4}-\d{2}-\d{2}$/.test(data.data?.custom_id || ''))) response = { type: 12 };
    else if (data.type===2 && data.data?.type===4) response={type:12};
    else if (data.type !== 2 || data.data?.name !== 'nyambung') response = reply('Perintah tidak dikenal.');
    else if (group?.name === 'main') response = { type: 12 };
    else if ((group?.name === 'leaderboard' || group?.name === 'recap') && data.channel_id) response = { type: 4, data: { content: group.name === 'leaderboard' ? reports.leaderboard(data.channel_id) : reports.recap(data.channel_id), allowed_mentions: { parse: [] } } };
    else if (group?.name !== 'pengingat') response = reply('Perintah tidak dikenal.');
    else if (!/^\d+$/.test(data.member?.permissions || '') || !(BigInt(data.member!.permissions!) & (32n | 8n))) response = reply('Kamu membutuhkan izin Manage Server.');
    else {
      const saved = store.sqlite.prepare('SELECT * FROM discord_reminders WHERE guild_id=?').get(config.guildId) as Reminder | undefined;
      if (action?.name === 'status') response = reply(saved ? `Pengingat ${saved.enabled ? 'aktif' : 'mati'} · <#${saved.channel_id}> · 00.05 WIB${saved.last_error ? `\n${saved.last_error}` : ''}` : 'Pengingat belum diatur. Gunakan /nyambung pengingat atur.');
      else if (action?.name === 'matikan') { store.sqlite.prepare('UPDATE discord_reminders SET enabled=0,updated_by=?,updated_at=? WHERE guild_id=?').run(data.member!.user.id, clock().getTime(), config.guildId); response = reply('Pengingat dimatikan.'); }
      else if ((action?.name === 'atur' || action?.name === 'tes') && data.token) {
        const channelId = action.name === 'atur' ? action.options?.find(item => item.name === 'channel')?.value : saved?.channel_id;
        if (!id.safeParse(channelId).success) response = reply('Pilih channel terlebih dahulu dengan /nyambung pengingat atur.');
        else {
          response = { type: 5, data: { flags: 64 } };
          work = async () => {
            let content: string;
            try {
              await validateChannel(channelId as string);
              if (action.name === 'atur') {
                store.sqlite.prepare(`INSERT INTO discord_reminders(guild_id,channel_id,enabled,updated_by,updated_at) VALUES (?,?,1,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,enabled=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at,last_error=NULL`).run(config.guildId, channelId, data.member!.user.id, clock().getTime());
                store.sqlite.prepare(`UPDATE discord_deliveries SET status=CASE WHEN status='blocked' THEN 'uncertain' ELSE 'pending' END,next_at=0,lease_until=0 WHERE guild_id=? AND date=? AND status IN ('failed','blocked')`).run(config.guildId, wibDate(clock()));
                content = `Pengingat aktif di <#${channelId}> setiap 00.05 WIB.`;
              } else {
                const date = wibDate(clock());
                const puzzle = store.sqlite.prepare('SELECT number FROM daily WHERE date=? AND demo=0').get(date) as { number: number } | undefined;
                if (!puzzle) content = 'Daily semantik hari ini belum tersedia; tidak ada pesan yang dikirim.';
                else { await client.request(`/channels/${channelId}/messages`, { method: 'POST', body: reminderMessage(date, puzzle.number, true) }); content = 'Contoh pengingat terkirim.'; }
              }
            } catch (error) { content = error instanceof DiscordHttpError ? 'Discord belum bisa diakses atau izin bot belum cukup. Periksa channel dan coba lagi.' : 'Pilih channel teks server beta dan berikan View Channel, Send Messages, Read Message History kepada bot.'; }
            await client.request(`/webhooks/${config.applicationId}/${data.token}/messages/@original`, { method: 'PATCH', body: { content, allowed_mentions: { parse: [] } } });
          };
        }
      } else response = reply('Perintah tidak dikenal.');
    }
    store.sqlite.prepare('DELETE FROM discord_interactions WHERE expires_at<?').run(clock().getTime());
    store.sqlite.prepare('INSERT INTO discord_interactions(id,reply,expires_at) VALUES (?,?,?)').run(data.id, JSON.stringify(response), clock().getTime() + 900000);
    if (work) defer(work);
    return response;
  }
  async function findSent(row: Delivery): Promise<string | null> {
    const bot = await botId();
    const midnight = Date.parse(`${row.date}T00:00:00+07:00`);
    const cutoff = (BigInt(midnight - 1420070400000) << 22n);
    let before = '';
    for (let page = 0; page < 10; page++) {
      const messages = await client.request<Message[]>(`/channels/${row.channel_id}/messages?limit=100${before ? `&before=${before}` : ''}`);
      const match = messages.find(message => message.author.id === bot.id && message.components?.some(group => group.components?.some(button => button.custom_id === `nyambung:daily:${row.date}`)));
      if (match) return match.id;
      if (messages.length < 100 || messages.some(message => BigInt(message.id) <= cutoff)) return null;
      before = messages.reduce((min, message) => BigInt(message.id) < BigInt(min) ? message.id : min, messages[0].id);
    }
    // An incomplete scan must not trigger a duplicate send in a busy channel.
    throw new DiscordHttpError(0, 120);
  }
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const now = clock().getTime(), date = wibDate(clock());
      const minutes = new Date(now + 7 * 3600000).getUTCHours() * 60 + new Date(now + 7 * 3600000).getUTCMinutes();
      const inWindow = minutes >= 5 && minutes < 120;
      const puzzle = store.sqlite.prepare('SELECT number FROM daily WHERE date=? AND demo=0').get(date) as { number: number } | undefined;
      const reminder = store.sqlite.prepare('SELECT * FROM discord_reminders WHERE guild_id=? AND enabled=1').get(config.guildId) as Reminder | undefined;
      if (inWindow && puzzle && reminder) store.sqlite.prepare('INSERT OR IGNORE INTO discord_deliveries(guild_id,date,channel_id) VALUES (?,?,?)').run(config.guildId, date, reminder.channel_id);
      const rows = store.sqlite.prepare(`SELECT * FROM discord_deliveries WHERE guild_id=? AND date=? AND status IN ('pending','uncertain') AND next_at<=? AND lease_until<=?`).all(config.guildId, date, now, now) as Delivery[];
      for (const row of rows) {
        if (!reminder || !puzzle || (!inWindow && row.status !== 'uncertain')) continue;
        if (!store.sqlite.prepare(`UPDATE discord_deliveries SET lease_until=? WHERE guild_id=? AND date=? AND lease_until<=? AND status=?`).run(now + 180000, row.guild_id, date, now, row.status).changes) continue;
        let uncertain = row.status === 'uncertain', sending = false;
        try {
          let messageId = uncertain ? await findSent(row) : null;
          const sendTime = clock(), sendMinutes = new Date(sendTime.getTime() + 7 * 3600000).getUTCHours() * 60 + new Date(sendTime.getTime() + 7 * 3600000).getUTCMinutes();
          if (!messageId && wibDate(sendTime) === date && sendMinutes >= 5 && sendMinutes < 120) {
            const current = store.sqlite.prepare('SELECT enabled,channel_id FROM discord_reminders WHERE guild_id=?').get(row.guild_id) as Reminder;
            if (!current.enabled) continue;
            row.channel_id = current.channel_id;
            store.sqlite.prepare(`UPDATE discord_deliveries SET status='uncertain',channel_id=?,attempts=attempts+1 WHERE guild_id=? AND date=?`).run(row.channel_id, row.guild_id, date);
            uncertain = true;
            sending = true;
            const nonce = createHash('sha256').update(`${row.guild_id}:${date}`).digest('hex').slice(0, 24);
            const message = await client.request<{ id: string }>(`/channels/${row.channel_id}/messages`, { method: 'POST', body: { ...reminderMessage(date, puzzle.number), nonce, enforce_nonce: true } });
            messageId = message.id;
          }
          store.sqlite.prepare('UPDATE discord_deliveries SET status=?,message_id=?,lease_until=0,last_error=NULL WHERE guild_id=? AND date=?').run(messageId ? 'sent' : 'expired', messageId, row.guild_id, date);
        } catch (error) {
          const remote = error instanceof DiscordHttpError ? error : new DiscordHttpError(0);
          const permanent = [400, 401, 403, 404].includes(remote.status);
          const unknown = uncertain && !(sending && [400, 401, 403, 404, 429].includes(remote.status));
          const message = permanent ? 'Pengingat berhenti: periksa token dan izin channel bot.' : remote.status === 429 ? 'Discord membatasi pengiriman; dijadwalkan ulang.' : 'Pengiriman belum terkonfirmasi; akan diperiksa sebelum mencoba lagi.';
          store.sqlite.prepare(`UPDATE discord_deliveries SET status=?,next_at=?,lease_until=0,last_error=? WHERE guild_id=? AND date=?`).run(permanent ? unknown ? 'blocked' : 'failed' : unknown ? 'uncertain' : 'pending', now + Math.max(remote.retryAfter * 1000, Math.min(300000, 30000 * 2 ** Math.min(row.attempts, 4))), message, row.guild_id, date);
          if (permanent) store.sqlite.prepare('UPDATE discord_reminders SET enabled=0,last_error=? WHERE guild_id=?').run(message, row.guild_id);
        }
      }
    } finally { ticking = false; }
  }
  function start() {
    const run = () => defer(async () => { await tick(); await reports.tick(); });
    run(); const timer = setInterval(run, 30000); timer.unref();
    return async () => { clearInterval(timer); await Promise.allSettled([...tasks]); };
  }
  return { handle, tick, start, reports, drain: async () => { await Promise.allSettled([...tasks]); } };
}

import { modeLabels } from '@nyambung/shared';
import type { MabarService } from './mabar.js';
import { createHash } from 'node:crypto';
import type { Store } from './db.js';
import { DiscordHttpError, type DiscordService } from './discord.js';
import { addDays, wibDate } from './time.js';
import { LIVE_CARD_STYLE_VERSION, renderLiveCard, renderMabarCard, type LiveCard, type CardPlayer } from './discord-card.js';

interface Report { channel_id:string; date:string; kind:'live'|'recap'; guild_id:string; message_id:string|null; payload:string|null; sent_hash:string|null; uncertain:number; revision?:number; last_bump_at?:number; active_keys?:string }
interface Standing { discord_id:string; total:number; completed_at:string|null }
interface Active { run_id:string|null; name:string; avatar:string|null; total:number; discord_id:string; mode:string|null; date:string|null; number:number|null; stages:number; completed_at:string|null }
const hash = (text:string) => createHash('sha256').update(text).digest('hex');
const mention = (id:string) => `<@${id}>`;

export function createDiscordReports(store:Store, discord:DiscordService, clock:()=>Date = () => new Date(), mabar?:MabarService) {
  const { client, config } = discord;
  let running = false;
  const marker = (row:Pick<Report,'date'|'kind'|'revision'>) => row.kind==='live' ? `Nyambung · live · ${row.revision??0}` : `Nyambung · recap · ${row.date}`;
  const table=(row:Report)=>row.kind==='live'?'discord_channel_cards':'discord_channel_reports';
  function standings(channelId:string, date:string) {
    // Only completed Daily runs actually played in this channel are ranked.
    // At midnight the cutoff freezes yesterday's results, including on retries.
    const cutoff = date < wibDate(clock()) ? `${addDays(date,1)}T00:00:00+07:00` : clock().toISOString();
    return store.sqlite.prepare(`SELECT r.id,i.discord_id,r.completed_at,
      COALESCE(SUM(CAST(json_extract(a.result,'$.score') AS INTEGER)),0) AS total
      FROM discord_channel_runs c JOIN runs r ON r.id=c.run_id
      JOIN discord_identities i ON i.discord_id=c.discord_id AND i.player_id=r.player_id
      JOIN puzzle_versions v ON v.id=r.version_id LEFT JOIN answers a ON a.run_id=r.id
      WHERE c.channel_id=? AND c.guild_id=? AND r.date=? AND r.mode='daily'
      AND r.superseded_at IS NULL AND v.demo=0 AND c.seen_at<=?
      GROUP BY r.id ORDER BY total DESC,i.discord_id`).all(channelId,config.guildId,date,Date.parse(cutoff)) as (Standing & {id:string})[];
  }
  function summary(channelId:string,date:string) {
    const cutoff = date < wibDate(clock()) ? Date.parse(`${addDays(date,1)}T00:00:00+07:00`) : clock().getTime();
    const all = standings(channelId,date);
    const finished = all.filter(row=>row.completed_at && Date.parse(row.completed_at)<=cutoff);
    return { all, finished };
  }
  function ranking(rows:Standing[],limit=10) {
    let rank=0,score=-1;
    return rows.slice(0,limit).map((row,index)=>{
      if(row.total!==score){rank=index+1;score=row.total;}
      return `${rank}. ${mention(row.discord_id)} · ${row.total.toLocaleString('id-ID')} poin`;
    }).join('\n') || 'Belum ada Daily yang selesai.';
  }
  function leaderboard(channelId:string,date=wibDate(clock())) {
    const {all,finished}=summary(channelId,date);
    return `**Leaderboard Daily · ${date}**\n${ranking(finished)}\n\n${finished.length}/${all.length} pemain selesai.`;
  }
  function recap(channelId:string,date=addDays(wibDate(clock()),-1)) {
    const saved=store.sqlite.prepare(`SELECT payload FROM discord_channel_reports WHERE channel_id=? AND date=? AND kind='recap' AND guild_id=?`).get(channelId,date,config.guildId) as {payload:string|null}|undefined;
    if(saved?.payload)return saved.payload;
    const {all,finished}=summary(channelId,date);
    const average=finished.length?Math.round(finished.reduce((n,row)=>n+row.total,0)/finished.length):0;
    return `**Recap Daily · ${date}**\n${all.length} pemain · ${finished.length} selesai · ${all.length-finished.length} belum selesai\nRata-rata selesai: ${average.toLocaleString('id-ID')} poin\n\n**Leaderboard akhir**\n${ranking(finished)}\n\nHasil sampai pukul 00.00 WIB.`;
  }
  function activePlayers(channelId:string,date:string) {
    return date===wibDate(clock()) ? store.sqlite.prepare(`SELECT r.id AS run_id,i.name,i.avatar,p.discord_id,r.mode,r.date,d.number,r.completed_at,COUNT(a.stage) AS stages,COALESCE(SUM(CAST(json_extract(a.result,'$.score') AS INTEGER)),0) AS total
      FROM discord_activity_players p JOIN discord_identities i ON i.discord_id=p.discord_id LEFT JOIN runs r ON r.id=p.run_id LEFT JOIN daily d ON d.date=r.date
      LEFT JOIN answers a ON a.run_id=r.id WHERE p.guild_id=? AND p.channel_id=? AND p.last_seen>?
      AND NOT EXISTS (SELECT 1 FROM discord_activity_players newer WHERE newer.discord_id=p.discord_id
        AND newer.channel_id=p.channel_id AND (newer.last_seen>p.last_seen OR (newer.last_seen=p.last_seen AND newer.instance_id>p.instance_id)))
      GROUP BY p.instance_id,p.discord_id ORDER BY p.discord_id`).all(config.guildId,channelId,clock().getTime()-90000) as Active[] : [];
  }
  function live(channelId:string,date:string) {
    const party=mabar?.report(channelId,config.guildId);
    if(party)return `**Nyambung · ${modeLabels[party.mode]}**\n${party.players.length} pemain · ${party.phase==='results'?'Selesai':party.phase==='lobby'?'Lobby':'Bermain'}${party.phase==='results'?'\n'+[...party.players].sort((a,b)=>(b.score??0)-(a.score??0)).map(p=>`${p.name} · ${p.score}`).join('\n'):''}`;
    const players=activePlayers(channelId,date);
    const lines=players.slice(0,12).map(p=>`${mention(p.discord_id)} · ${p.mode==='random'?'Acak':p.mode?`${p.date!==date?'Arsip':'Daily'} #${String(p.number??0).padStart(3,'0')}`:'Lobi'} · ${p.completed_at?'Selesai':p.mode?`Babak ${Math.min(5,p.stages+1)}/5`:'Siap main'}`);
    if(players.length>12)lines.push(`+${players.length-12} pemain lain`);
    const {all,finished}=summary(channelId,date);
    return `**Nyambung · ${date}**\n**Sedang main · ${players.length} pemain**\n${lines.join('\n')||'Belum ada pemain aktif.'}\n\n**Leaderboard Daily**\n${ranking(finished,5)}\n\n${finished.length}/${all.length} pemain Daily selesai.`;
  }
  function stageScores(runId:string):number[] {
    const scores=Array<number>(5).fill(0);
    const rows=store.sqlite.prepare("SELECT stage,CAST(json_extract(result,'$.score') AS INTEGER) AS score FROM answers WHERE run_id=? ORDER BY stage").all(runId) as {stage:number;score:number}[];
    for(const row of rows)if(row.stage>=0&&row.stage<5)scores[row.stage]=row.score;
    return scores;
  }
  function cardData(channelId:string,date:string):LiveCard {
    const active=activePlayers(channelId,date);
    const players:CardPlayer[]=active.slice(0,8).map(player=>({id:player.discord_id,name:player.name,avatar:player.avatar,stages:player.stages,completed:!!player.completed_at,score:player.completed_at?player.total:null,stageScores:player.completed_at&&player.run_id?stageScores(player.run_id):undefined,active:true,label:player.mode==='random'?'Acak':player.mode?`${player.date!==date?'Arsip':'Daily'} #${String(player.number??0).padStart(3,'0')}`:'Lobi'}));
    for(const player of summary(channelId,date).finished){
      if(players.length>=8)break;
      if(players.some(row=>row.id===player.discord_id))continue;
      const identity=store.sqlite.prepare('SELECT name,avatar FROM discord_identities WHERE discord_id=?').get(player.discord_id) as {name:string;avatar:string|null};
      players.push({id:player.discord_id,...identity,stages:5,completed:true,score:player.total,stageScores:stageScores(player.id),active:false,label:'Daily · Selesai'});
    }
    const daily=store.sqlite.prepare('SELECT number FROM daily WHERE date=?').get(date) as {number:number}|undefined;
    return {date,number:daily?.number??null,activeCount:active.length,players};
  }
  async function findExisting(row:Report):Promise<string|null> {
    // After an ambiguous POST, scan before retrying. A failed/incomplete scan
    // leaves the report pending; it never authorizes a second send.
    const bot=await client.request<{id:string}>('/users/@me');
    const cutoff=BigInt(Date.parse(`${row.date}T00:00:00+07:00`)-1420070400000)<<22n;
    let before='';
    for(let page=0;page<10;page++){
      const messages=await client.request<{id:string;author:{id:string};content?:string}[]>(`/channels/${row.channel_id}/messages?limit=100${before?`&before=${before}`:''}`);
      const found=messages.find(m=>m.author.id===bot.id&&(m.content?.endsWith(marker(row)) || (row.kind==='live' && !row.revision && /\n-# Nyambung · live(?: · \d{4}-\d{2}-\d{2})?$/.test(m.content??''))));
      if(found)return found.id;
      if(messages.length<100||(row.kind==='recap'&&messages.some(m=>BigInt(m.id)<=cutoff)))return null;
      before=messages.reduce((min,m)=>BigInt(m.id)<BigInt(min)?m.id:min,messages[0].id);
    }
    throw new DiscordHttpError(0,120);
  }
  async function isBuried(channelId:string,messageId:string){
    const messages=await client.request<{id:string;author:{id:string;bot?:boolean}}[]>(`/channels/${channelId}/messages?after=${messageId}&limit=100`);
    return messages.filter(message=>message.id!==messageId && message.author.id!==config.applicationId && !message.author.bot).length>=8;
  }
  async function publish(row:Report) {
    const now=clock().getTime();
    const content=row.payload ?? live(row.channel_id,row.date);
    const party=row.kind==='live'?mabar?.report(row.channel_id,config.guildId):null;
    const card=row.kind==='live'?cardData(row.channel_id,row.date):undefined;
    const keys=card?activePlayers(row.channel_id,row.date).map(player=>`${player.discord_id}:${player.run_id??'lobby'}`):[];
    let previous:string[]=[];try{previous=JSON.parse(row.active_keys??'[]');}catch{ /* Old cards start with no players. */ }
    const joined=keys.some(key=>!previous.includes(key));
    const birth=row.message_id && /^\d+$/.test(row.message_id)?Number(BigInt(row.message_id)>>22n)+1420070400000:0;
    const lastBump=row.last_bump_at||birth;
    const canBump=!!card && !!row.message_id && !row.uncertain && joined && now-lastBump>=600000;
    const body={content:`${content}\n-# ${marker(row)}`,allowed_mentions:{parse:[]},flags:4096,
      ...(card?{components:[{type:1,components:[{type:2,style:1,label:'Play',custom_id:'nyambung:play'}]}],attachments:[{id:0,filename:'nyambung-live.png',description:'Pemain Nyambung dan progres babak.'}]}:{})};
    let digest=hash(JSON.stringify({body,card,party,...(card?{cardStyle:LIVE_CARD_STYLE_VERSION}:{})}));
    if(row.sent_hash===digest && !canBump){
      if(card)store.sqlite.prepare('UPDATE discord_channel_cards SET active_keys=? WHERE channel_id=? AND sent_hash IS ? AND lease_until<=?').run(JSON.stringify(keys),row.channel_id,row.sent_hash,now);
      return;
    }
    if(!store.sqlite.prepare(`UPDATE ${table(row)} SET lease_until=? WHERE channel_id=? AND date=? AND kind=? AND lease_until<=? AND next_at<=? AND sent_hash IS ?${card?' AND revision=? AND message_id IS ?':''}`).run(now+180000,row.channel_id,row.date,row.kind,now,now,row.sent_hash,...(card?[row.revision??0,row.message_id]:[])).changes)return;
    let messageId=row.message_id,bumped=false;
    try {
      if(canBump && await isBuried(row.channel_id,messageId!)){
        // Allocate a new revision before POST. A retry can then locate exactly
        // that send, rather than mistaking the older card for the new one.
        row.revision=(row.revision??0)+1;
        store.sqlite.prepare('UPDATE discord_channel_cards SET message_id=NULL,revision=?,uncertain=1 WHERE channel_id=?').run(row.revision,row.channel_id);
        messageId=null;bumped=true;
        body.content=`${content}\n-# ${marker(row)}`;
        digest=hash(JSON.stringify({body,card,party,...(card?{cardStyle:LIVE_CARD_STYLE_VERSION}:{})}));
      }
      const file=card?{name:'nyambung-live.png',data:party?await renderMabarCard(party):await renderLiveCard(card)}:undefined;
      if(!messageId&&row.uncertain&&!bumped)messageId=await findExisting(row);
      if(messageId){
        try {await client.request(`/channels/${row.channel_id}/messages/${messageId}`,{method:'PATCH',body,file});}
        catch(error){if(!(error instanceof DiscordHttpError)||error.status!==404)throw error;messageId=null;store.sqlite.prepare(`UPDATE ${table(row)} SET message_id=NULL WHERE channel_id=? AND date=? AND kind=?`).run(row.channel_id,row.date,row.kind);}
      }
      if(!messageId){
        store.sqlite.prepare(`UPDATE ${table(row)} SET uncertain=1 WHERE channel_id=? AND date=? AND kind=?`).run(row.channel_id,row.date,row.kind);
        const nonce=hash(`${config.guildId}:${row.channel_id}:${row.kind==='live'?'live:'+String(row.revision??0):row.date+':recap'}`).slice(0,24);
        messageId=(await client.request<{id:string}>(`/channels/${row.channel_id}/messages`,{method:'POST',body:{...body,nonce,enforce_nonce:true},file})).id;
      }
      store.sqlite.transaction(()=>{
        store.sqlite.prepare(`UPDATE ${table(row)} SET message_id=?,sent_hash=?,payload=COALESCE(payload,?),uncertain=0,lease_until=0,next_at=?,last_error=NULL WHERE channel_id=? AND date=? AND kind=?`).run(messageId,digest,null,now+30000,row.channel_id,row.date,row.kind);
        if(card)store.sqlite.prepare('UPDATE discord_channel_cards SET active_keys=?,last_bump_at=? WHERE channel_id=?').run(JSON.stringify(keys),bumped||!row.message_id?now:lastBump,row.channel_id);
      }).immediate();
    } catch(error){
      const remote=error instanceof DiscordHttpError?error:new DiscordHttpError(0);
      store.sqlite.prepare(`UPDATE ${table(row)} SET lease_until=0,next_at=?,last_error=? WHERE channel_id=? AND date=? AND kind=?`).run(now+Math.max(remote.retryAfter*1000,[401,403,404].includes(remote.status)?300000:30000),`Discord HTTP ${remote.status}`,row.channel_id,row.date,row.kind);
    }
  }
  async function tick(){
    if(running)return;
    running=true;
    try {
      const date=wibDate(clock()),yesterday=addDays(date,-1),now=clock().getTime();
      if(now>=Date.parse(`${date}T00:05:00+07:00`)){
        const channels=store.sqlite.prepare(`SELECT DISTINCT c.channel_id FROM discord_channel_runs c JOIN runs r ON r.id=c.run_id JOIN puzzle_versions v ON v.id=r.version_id
          WHERE c.guild_id=? AND r.mode='daily' AND r.date=? AND v.demo=0 AND c.seen_at<=?`).all(config.guildId,yesterday,Date.parse(`${date}T00:00:00+07:00`)) as {channel_id:string}[];
        for(const channel of channels)store.sqlite.prepare(`INSERT OR IGNORE INTO discord_channel_reports(channel_id,date,kind,guild_id,payload) VALUES (?,?,'recap',?,?)`).run(channel.channel_id,yesterday,config.guildId,recap(channel.channel_id,yesterday));
      }
      store.sqlite.prepare(`UPDATE discord_channel_cards SET date=?,sent_hash=NULL,payload=NULL,next_at=0 WHERE guild_id=? AND date<>? AND lease_until<=?`).run(date,config.guildId,date,now);
      const cards=store.sqlite.prepare(`SELECT * FROM discord_channel_cards WHERE guild_id=? AND next_at<=? AND lease_until<=? ORDER BY next_at LIMIT 50`).all(config.guildId,now,now) as Report[];
      const recaps=store.sqlite.prepare(`SELECT * FROM discord_channel_reports WHERE guild_id=? AND next_at<=? AND lease_until<=? AND kind='recap' AND sent_hash IS NULL ORDER BY date LIMIT 50`).all(config.guildId,now,now) as Report[];
      const rows=[...cards,...recaps];
      for(const row of rows)await publish(row);
    }finally{running=false;}
  }
  return {tick,leaderboard,recap,cardData};
}

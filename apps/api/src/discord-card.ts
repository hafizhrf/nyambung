import sharp from 'sharp';
import { crtImage } from '@nyambung/shared';
import { dungeonText } from './dungeonText.js';

// Bump when card artwork changes so existing channel messages refresh.
export const LIVE_CARD_STYLE_VERSION=4;

export interface CardPlayer { id:string; name:string; avatar:string|null; stages:number; completed:boolean; label:string; score:number|null; stageScores?:number[]; active:boolean }
export interface LiveCard { date:string; number:number|null; activeCount:number; players:CardPlayer[] }
const xml=(value:string)=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));
// Match each completed round to its own score on the fixed 0–1,000 scale.
function stageColor(score:number):string {
  const strength=Math.max(0,Math.min(1000,Number.isFinite(score)?score:0))/1000;
  const low=[33,69,52],high=[112,220,160];
  return '#'+low.map((value,index)=>Math.round(value+(high[index]-value)*strength).toString(16).padStart(2,'0')).join('');
}
const avatars=new Map<string,Promise<string|null>>();
async function avatarImage(player:CardPlayer):Promise<string|null>{
  if(!player.avatar||!/^\d{5,24}$/.test(player.id)||!/^[a-f\d_]+$/i.test(player.avatar))return null;
  const key=`${player.id}/${player.avatar}`;
  if(!avatars.has(key)){
    if(avatars.size>=128)avatars.delete(avatars.keys().next().value!);
    avatars.set(key,(async()=>{
      try{
        const response=await fetch(`https://cdn.discordapp.com/avatars/${key}.png?size=64`,{signal:AbortSignal.timeout(3000),redirect:'error'});
        if(!response.ok||Number(response.headers.get('content-length'))>1048576||!response.body)return null;
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}
        const png=await sharp(Buffer.concat(chunks),{limitInputPixels:1048576}).resize(64,64).png().toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
      }catch{return null;}
    })());
  }
  return avatars.get(key)!;
}

export async function renderLiveCard(card:LiveCard):Promise<Buffer>{
  const players=card.players.slice(0,8),height=220+Math.max(1,players.length)*86;
  const photos=await Promise.all(players.map(avatarImage));
  const rows=players.map((player,index)=>{
    const y=142+index*86,stages=Math.max(0,Math.min(5,player.stages));
    const color=player.completed?'#8ee07a':'#c69af2';
    const blocks=Array.from({length:5},(_,stage)=>`<rect x="${470+stage*45}" y="${y+12}" width="34" height="34" rx="0" fill="${stage<stages?(player.completed?stageColor(player.stageScores?.[stage]??0):color):'#282033'}" ${!player.completed&&stage===stages?'stroke="#c69af2" stroke-width="2"':''}/>`).join('');
    const avatar=photos[index]?`<defs><clipPath id="avatar-${index}"><circle cx="72" cy="${y+28}" r="26"/></clipPath></defs><image x="46" y="${y+2}" width="52" height="52" xlink:href="${photos[index]}" clip-path="url(#avatar-${index})"/>`:`<circle cx="72" cy="${y+28}" r="26" fill="#392d4a"/><text x="72" y="${y+36}" text-anchor="middle" fill="#edcb78" font-size="23">${xml([...player.name][0]?.toUpperCase()??'?')}</text>`;
    const name=[...player.name].slice(0,23).join('')+([...player.name].length>23?'…':'');
    return `<g>${avatar}<circle cx="92" cy="${y+48}" r="6" fill="${player.active?'#8ee07a':'#b0a8c0'}" stroke="#101017" stroke-width="3"/>${/^[\x20-\x7e]+$/.test(player.name)?'':`<text x="116" y="${y+23}" font-size="22" font-weight="600" fill="#f0e9cb">${xml(name)}</text>`}${blocks}<path d="M44 ${y+70}H916" stroke="#39334c"/></g>`;
  }).join('');
  const date=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${card.date}T12:00:00+07:00`));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="${height}" viewBox="0 0 960 ${height}"><rect width="960" height="${height}" rx="0" fill="#08090d"/><rect x="16" y="16" width="928" height="${height-32}" rx="0" fill="#101017" stroke="#edcb78" stroke-width="2"/><rect x="23" y="23" width="914" height="${height-46}" fill="none" stroke="#66513b"/><g font-family="DejaVu Sans, sans-serif"><path d="M44 120H916" stroke="#66513b"/>${rows}</g></svg>`;
  const overlays=await Promise.all([
    ...(!players.length?[dungeonText('Belum ada yang main.',(960-19*16)/2,174,16,'#b0a8c0',800)]:[]),
    dungeonText('nyambung',44,38,38,'#edcb78',550),
    dungeonText(`${card.number?`Daily #${String(card.number).padStart(3,'0')}`:'Nyambung'} · ${date}`,44,90,17,'#b0a8c0',660),
    dungeonText(`${card.activeCount} sedang main`,710,50,14,'#8ee07a',210),
    dungeonText('nyambung.web.id',730,height-40,12,'#c69af2',190),
    ...players.flatMap((player,index)=>[...(/^[\x20-\x7e]+$/.test(player.name)?[dungeonText(player.name.length>18?player.name.slice(0,17)+'…':player.name,116,148+index*86,16,'#f0e9cb',320)]:[]),dungeonText(player.label,116,181+index*86,12,'#b0a8c0',330)]),
    ...players.map((player,index)=>dungeonText(player.completed&&player.score!==null?`${player.score.toLocaleString('id-ID')} poin`:player.label==='Lobi'?'Siap main':`Babak ${Math.min(5,Math.max(0,player.stages)+1)}/5`,720,156+index*86,20,player.completed?'#8ee07a':'#c69af2',190)),
  ]);
  const {data,info}=await sharp(Buffer.from(svg)).composite(overlays).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return sharp(Buffer.from(crtImage(data,info.width,info.height)),{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}

export async function renderMabarCard(card:NonNullable<ReturnType<import('./mabar.js').MabarService['report']>>){
 const {modeLabels}=await import('@nyambung/shared');const height=220+card.players.length*70;const photos=await Promise.all(card.players.map(p=>avatarImage({...p,stages:0,completed:false,label:'',active:true})));
 const rows=card.players.map((p,n)=>{const y=160+n*70;return `<g>${photos[n]?`<image x="44" y="${y-30}" width="40" height="40" xlink:href="${photos[n]}"/>`:''}${/^[\x20-\x7e]+$/.test(p.name)?'':`<text x="104" y="${y}" fill="#f0e9cb" font-family="DejaVu Sans" font-size="23">${xml(p.name.slice(0,30))}</text>`}<path d="M44 ${y+20}H916" stroke="#39334c"/></g>`;}).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="${height}"><rect width="960" height="${height}" fill="#08090d"/><rect x="16" y="16" width="928" height="${height-32}" fill="#101017" stroke="#edcb78" stroke-width="3"/>${rows}</svg>`;
 const overlays=await Promise.all([dungeonText('NYAMBUNG',44,38,30,'#edcb78',450),dungeonText(modeLabels[card.mode],44,86,18,'#c69af2',550),dungeonText(card.phase==='results'?'Selesai':card.phase==='lobby'?'Lobby':card.total?`Babak ${Math.min(card.stage+1,card.total)}/${card.total}`:`Putaran ${card.stage+1}`,660,46,18,'#8ee07a',250),...card.players.flatMap((p,n)=>[...(/^[\x20-\x7e]+$/.test(p.name)?[dungeonText(p.name,104,140+n*70,18,'#f0e9cb',650)]:[]),...(p.score!==null?[dungeonText(String(p.score),790,140+n*70,22,'#edcb78',120)]:[])]),dungeonText('nyambung.web.id',44,height-44,12,'#b0a8c0',800)]);
 const {data,info}=await sharp(Buffer.from(svg)).composite(overlays).ensureAlpha().raw().toBuffer({resolveWithObject:true});return sharp(Buffer.from(crtImage(data,info.width,info.height)),{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}

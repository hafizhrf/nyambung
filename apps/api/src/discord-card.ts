import sharp from 'sharp';

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
    const color=player.completed?'#70dca0':'#81b6ff';
    const blocks=Array.from({length:5},(_,stage)=>`<rect x="${470+stage*45}" y="${y+12}" width="34" height="34" rx="8" fill="${stage<stages?(player.completed?stageColor(player.stageScores?.[stage]??0):color):'#243246'}" ${!player.completed&&stage===stages?'stroke="#81b6ff" stroke-width="2"':''}/>`).join('');
    const avatar=photos[index]?`<defs><clipPath id="avatar-${index}"><circle cx="72" cy="${y+28}" r="26"/></clipPath></defs><image x="46" y="${y+2}" width="52" height="52" xlink:href="${photos[index]}" clip-path="url(#avatar-${index})"/>`:`<circle cx="72" cy="${y+28}" r="26" fill="#2d4665"/><text x="72" y="${y+36}" text-anchor="middle" fill="#c9dfff" font-size="23">${xml([...player.name][0]?.toUpperCase()??'?')}</text>`;
    const name=[...player.name].slice(0,23).join('')+([...player.name].length>23?'…':'');
    return `<g>${avatar}<circle cx="92" cy="${y+48}" r="6" fill="${player.active?'#42ca82':'#8392a8'}" stroke="#182332" stroke-width="3"/><text x="116" y="${y+23}" font-size="22" font-weight="600" fill="#ecf2fc">${xml(name)}</text><text x="116" y="${y+47}" font-size="15" fill="#a5b5cd">${xml(player.label)}</text>${blocks}<text x="900" y="${y+31}" text-anchor="end" font-size="${player.completed?25:20}" font-weight="600" fill="${color}">${player.completed&&player.score!==null?`${player.score.toLocaleString('id-ID')} poin`:player.label==='Lobi'?'Siap main':`Babak ${Math.min(5,stages+1)}/5`}</text><path d="M44 ${y+70}H916" stroke="#2a3a50"/></g>`;
  }).join('');
  const date=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${card.date}T12:00:00+07:00`));
  const empty=players.length?'':`<text x="480" y="187" text-anchor="middle" fill="#a5b5cd" font-size="22">Belum ada pemain aktif. Tekan Play untuk mulai.</text>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="${height}" viewBox="0 0 960 ${height}"><rect width="960" height="${height}" rx="24" fill="#101722"/><rect x="16" y="16" width="928" height="${height-32}" rx="18" fill="#182332" stroke="#304157"/><g font-family="DejaVu Sans, sans-serif"><text x="44" y="67" fill="#ecf2fc" font-size="38" font-weight="700">nyambung<tspan fill="#81b6ff">.</tspan></text><text x="44" y="101" fill="#a5b5cd" font-size="17">${xml(card.number?`Daily #${String(card.number).padStart(3,'0')}`:'Nyambung')} · ${xml(date)}</text><circle cx="${card.activeCount?746:736}" cy="58" r="6" fill="${card.activeCount?'#42ca82':'#8392a8'}"/><text x="900" y="65" text-anchor="end" fill="#c0d0e4" font-size="18">${card.activeCount} sedang main</text><path d="M44 120H916" stroke="#304157"/>${rows}${empty}<text x="44" y="${height-35}" fill="#a5b5cd" font-size="15">5 babak · Tanpa bocoran jawaban</text><text x="916" y="${height-35}" text-anchor="end" fill="#81b6ff" font-size="15">nyambung.web.id</text></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

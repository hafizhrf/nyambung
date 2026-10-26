import { useEffect, useState } from 'react';
import type { DiscordServerScores } from '@nyambung/shared';
import { api } from './api';
import { platform } from './platform';
import { DiscordAvatar } from './DiscordRoom';

export function DiscordScores({runId}:{runId:string}) {
  const [scores,setScores]=useState<DiscordServerScores|null>(null);
  const [error,setError]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let stopped=false,loading=false;
    setScores(null);setError(false);setExpanded(false);
    async function update(){
      if(stopped||loading||document.hidden)return;
      loading=true;
      try{const result=await api<DiscordServerScores>(`/discord/scores/${encodeURIComponent(runId)}`);if(!stopped){setScores(result);setError(false);}}
      catch{if(!stopped)setError(true);}
      finally{loading=false;}
    }
    void update();const timer=setInterval(()=>void update(),15000);
    const onVisible=()=>void update();document.addEventListener('visibilitychange',onVisible);
    return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[runId,retry]);
  return <section className="server-scores" aria-label="Skor pemain di server">
    <div className="server-scores-heading"><h2>Skor di server</h2><span>{scores ? `${scores.totalPlayers} selesai` : 'Daily yang sama'}</span></div>
    {scores && scores.players.length>0 ? <><ol className="server-score-list">{scores.players.slice(0,expanded?50:3).map(player=><li key={player.id} className={player.id===platform.userId?'is-you':''}><span className="server-score-rank">#{player.rank}</span><DiscordAvatar player={player}/><strong>{player.name}{player.id===platform.userId?' (kamu)':''}</strong><b>{player.score.toLocaleString('id-ID')}</b></li>)}</ol>{scores.players.length>3 && <button className="text-button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Ringkas':'Lihat semua skor'}</button>}{scores.totalPlayers>50&&expanded&&<p>Menampilkan 50 peringkat teratas.</p>}</> : <p role="status">{scores ? 'Belum ada skor Daily lain yang selesai.' : error ? <>Skor belum termuat. <button className="text-button" onClick={()=>setRetry(value=>value+1)}>Coba lagi</button></> : 'Memuat skor pemain…'}</p>}
    {scores&&error&&<p role="status">Pembaruan skor tertunda. Mencoba lagi…</p>}
  </section>;
}

import { PixelIcon } from './Arcade';
import { OpenInNewWindowIcon, CheckIcon, ReloadIcon } from './PixelIcons';
import type { RunView, StagePrompt } from '@nyambung/shared';

export function ActivityMini({run,stage,loading,error}:{run:RunView|null;stage?:StagePrompt|null;loading:boolean;error:string}){
  const done=!!run?.completed;
  const count=run?.results.length??0;
  const mode=run?.mode==='random'?'Acak':run?`Daily #${String(run.number).padStart(3,'0')}`:'Nyambung';
  return <section className="activity-mini" aria-label="Ringkasan Activity">
    <header className="mini-header"><span className="mini-brand"><PixelIcon name="link"/>nyambung<span>.</span></span><span className="mini-mode">{mode}</span></header>
    <div className="mini-body">
      <div className="mini-status" role="status" aria-live="polite"><span>{loading?'Menghubungkan…':error?'Koneksi terputus':done?'Selesai':stage?`${run?.total.toLocaleString('id-ID')??0} poin`:'Siap main'}</span><strong>{loading?<ReloadIcon className="spin" width={23} height={23}/>:error?'Coba lagi':done?run!.total.toLocaleString('id-ID'):stage?`${stage.index+1} / 5`:'Cari sambungan'}</strong>{done&&<small>dari 5.000 poin</small>}</div>
      {!loading&&!error&&<div className={`mini-clues ${done?'is-complete':''}`}>{done?<><CheckIcon width={26} height={26}/><span>Selesai</span></>:stage?stage.clues.map((clue,index)=><span key={index}>{clue}</span>):<span>Pilih permainan</span>}</div>}
    </div>
    <div className="mini-progress" role="progressbar" aria-label="Babak selesai" aria-valuemin={0} aria-valuemax={5} aria-valuenow={count}>{Array.from({length:5},(_,index)=><i key={index} data-done={index<count}/>)}</div>
    <p className="mini-hint"><OpenInNewWindowIcon width={11} height={11}/><span className="mini-hint-full">{done?'Buka Activity untuk melihat hasil':error?'Buka Activity untuk mencoba lagi':'Buka Activity untuk menjawab'}</span><span className="mini-hint-short">{done?'Buka hasil':error?'Buka, coba lagi':'Buka Activity'}</span></p>
  </section>;
}

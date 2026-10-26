import { Link2Icon, OpenInNewWindowIcon, CheckIcon, ReloadIcon } from '@radix-ui/react-icons';
import type { RunView, StagePrompt } from '@nyambung/shared';

export function ActivityMini({run,stage,loading,error}:{run:RunView|null;stage?:StagePrompt|null;loading:boolean;error:string}){
  const done=!!run?.completed;
  const count=run?.results.length??0;
  const mode=run?.mode==='random'?'Acak':run?`Daily #${String(run.number).padStart(3,'0')}`:'Nyambung';
  return <section className="activity-mini" aria-label="Ringkasan Activity">
    <header className="mini-header"><span className="mini-brand"><Link2Icon width={18} height={18}/>nyambung<span>.</span></span><span className="mini-mode">{mode}</span></header>
    <div className="mini-body">
      <div className="mini-status" role="status" aria-live="polite"><span>{loading?'Menghubungkan…':error?'Koneksi terputus':done?'Selesai':stage?`Babak ${stage.index+1} / 5`:'Siap main'}</span><strong>{loading?<ReloadIcon className="spin" width={23} height={23}/>:error?'Coba lagi':done?run!.total.toLocaleString('id-ID'):stage?{bridge2:'Dua kata',bridge3:'Tiga kata',closest:'Dekat makna'}[stage.kind]:'Cari sambungan'}</strong>{done&&<small>dari 5.000 poin</small>}</div>
      {!loading&&!error&&<div className={`mini-clues ${done?'is-complete':''}`}>{done?<><CheckIcon width={26} height={26}/><span>Lima babak tersambung</span></>:stage?stage.clues.map((clue,index)=><span key={index}>{clue}</span>):<span>Lima babak, satu kata tiap babak.</span>}</div>}
    </div>
    <div className="mini-progress" role="progressbar" aria-label="Babak selesai" aria-valuemin={0} aria-valuemax={5} aria-valuenow={count}>{Array.from({length:5},(_,index)=><i key={index} data-done={index<count}/>)}</div>
    <p className="mini-hint"><OpenInNewWindowIcon width={11} height={11}/>{done?'Buka Activity untuk melihat hasil':error?'Buka Activity untuk mencoba lagi':'Buka Activity untuk menjawab'}</p>
  </section>;
}

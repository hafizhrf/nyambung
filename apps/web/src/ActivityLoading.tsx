import { PixelIcon } from './Arcade';
import { useEffect, useState } from 'react';
import { CheckIcon, Cross2Icon, ReloadIcon } from './PixelIcons';

export function ActivityLoading({step,error,retry}:{step:'auth'|'game'|'error';error:string;retry:()=>void}) {
  const [slow,setSlow]=useState(false);
  useEffect(()=>{setSlow(false);const timer=setTimeout(()=>setSlow(true),10000);return()=>clearTimeout(timer);},[step]);
  const failed=step==='error';
  return <section className={`activity-loading ${failed?'has-error':''}`} aria-label="Memuat Activity" aria-busy={!failed}>
    <div className="activity-loading-symbol" aria-hidden="true"><span/>{failed?<Cross2Icon width={28} height={28}/>:<PixelIcon name="link"/>}</div>
    <div role="status" aria-live="polite" aria-atomic="true"><h1>{failed?'Belum bisa membuka Nyambung':'Sebentar, ya.'}</h1><p>{failed?'Koneksi belum selesai. Kamu bisa mencoba lagi.':step==='auth'?'Menghubungkan akun Discord…':'Menyiapkan Daily dan progresmu…'}</p></div>
    {!failed&&<ol className="activity-loading-steps" aria-label="Proses membuka Activity"><li data-state={step==='auth'?'current':'done'} aria-current={step==='auth'?'step':undefined}><span>{step==='game'?<CheckIcon width={14} height={14}/>:<i/>}</span>Akun Discord</li><li data-state={step==='game'?'current':'waiting'} aria-current={step==='game'?'step':undefined}><span>{step==='game'?<i/>:'2'}</span>Daily hari ini</li></ol>}
    {failed?<><p className="error-message" role="alert">{error}</p><button className="primary-button" onClick={retry}><ReloadIcon width={16} height={16}/>Coba lagi</button></>:<p className="activity-loading-note">{step==='auth'?'Jika Discord meminta izin, pilih Authorize untuk lanjut.':'Permainan akan terbuka otomatis setelah siap.'}{slow&&<span>{step==='auth'?'Periksa juga apakah dialog izin Discord masih terbuka.':'Masih memuat. Tunggu sebentar lagi.'}</span>}</p>}
  </section>;
}

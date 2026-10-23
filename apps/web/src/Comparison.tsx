import { useEffect, useState } from 'react';
import type { DailyComparison } from '@nyambung/shared';
import { api } from './api';
export function Comparison({ runId }: { runId: string }) {
  const [data, setData] = useState<DailyComparison | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(false);
    api<DailyComparison>(`/runs/${runId}/comparison`).then(value => { if (!cancelled) setData(value); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [runId, retry]);
  const num = (value: number) => value.toLocaleString('id-ID');
  return <section className="daily-comparison" aria-label="Perbandingan daily" aria-live="polite">
    {data ? <><div className="comparison-summary"><strong>{data.abovePercent !== null ? `Kamu lebih baik dari ${data.abovePercent}% pemain lain` : 'Menunggu pemain lain'}</strong><span>{num(data.players)} selesai · Rata-rata {data.players ? num(data.average) : '—'}{data.rank ? ` · #${num(data.rank)}` : ''}</span></div><div className="score-distribution" role="img" aria-label={`Distribusi skor ${num(data.players)} pemain${data.ownScore != null ? `, skormu ${num(data.ownScore)}` : ''}`}>
      <div className="histogram-bars">{(data.histogram ?? Array(10).fill(0)).map((count,index) => <div key={index} className={`histogram-bin ${data.ownScore != null && Math.min(9,Math.floor(data.ownScore/500)) === index ? 'is-you' : ''}`} title={`${num(index*500)}–${num(index===9 ? 5000 : index*500+499)}: ${num(count)} pemain`}><i className="histogram-bar" style={{height:`${count/Math.max(1,...(data.histogram??[]))*100}%`}}/></div>)}</div>
      <div className="histogram-axis"><span>0</span><span>{data.ownScore != null ? `Kamu ${num(data.ownScore)}` : 'Skor'}</span><span>5.000</span></div>
    </div></> : <p role="status">{error ? <>Perbandingan belum termuat. <button className="text-button" onClick={() => setRetry(value => value + 1)}>Coba lagi</button></> : 'Memuat perbandingan pemain…'}</p>}
  </section>;
}

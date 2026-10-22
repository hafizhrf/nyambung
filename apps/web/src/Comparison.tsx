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
    {data ? <><div><strong>{num(data.players)}</strong><span>Pemain selesai</span></div><div><strong>{data.players ? num(data.average) : '—'}</strong><span>Rata-rata skor</span></div><div><strong>{data.rank ? `#${num(data.rank)}` : '—'}</strong><span>{data.abovePercent !== null ? `Di atas ${data.abovePercent}% pemain lain` : data.players > 1 ? 'Peringkatmu' : 'Menunggu pemain lain'}</span></div></> : <p role="status">{error ? <>Perbandingan belum termuat. <button className="text-button" onClick={() => setRetry(value => value + 1)}>Coba lagi</button></> : 'Memuat perbandingan pemain…'}</p>}
  </section>;
}

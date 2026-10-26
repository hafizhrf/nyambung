import { useEffect, useState } from 'react';
import { ArrowRightIcon, CheckIcon } from './PixelIcons';
import type { ArchiveView } from '@nyambung/shared';
import { api } from './api';

const dateLabel = (date: string) => new Intl.DateTimeFormat('id-ID', {
  day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Jakarta',
}).format(new Date(`${date}T12:00:00+07:00`));

export function DailyArchive({ onPlay, busy, playError }: { onPlay: (date: string) => void; busy: boolean; playError: string }) {
  const [data, setData] = useState<ArchiveView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function load(before?: string) {
    setLoading(true); setError('');
    try {
      const next = await api<ArchiveView>(`/archive${before ? `?before=${encodeURIComponent(before)}` : ''}`);
      setData(previous => before && previous ? { ...next, entries:[...previous.entries,...next.entries] } : next);
    } catch { setError('Arsip belum bisa dimuat. Coba lagi, ya.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <div className="daily-archive">
    <p className="archive-intro">Pilih Daily yang terlewat. Progres tersimpan untuk setiap tanggal, mengikuti waktu WIB.</p>
    {data && (data.entries.length ? <ul className="archive-list" aria-label="Daftar Daily">
      {data.entries.map(entry => <li key={entry.date}>
        <button className="archive-entry" disabled={busy} onClick={() => onPlay(entry.date)}>
          <span><strong>Daily #{String(entry.number).padStart(3,'0')}</strong><time dateTime={entry.date}>{dateLabel(entry.date)}{entry.demo ? ' · Demo' : ''}</time></span>
          <span className={`archive-status ${entry.status}`}>
            {entry.status === 'completed' ? <><CheckIcon aria-hidden="true"/>Lihat hasil</> : entry.status === 'in_progress' ? 'Lanjutkan' : 'Main'}
            <ArrowRightIcon aria-hidden="true"/>
          </span>
        </button>
      </li>)}
    </ul> : <p className="archive-empty">Belum ada Daily sebelumnya. Daily yang sudah lewat akan muncul di sini.</p>)}
    {loading && <p className="archive-loading" role="status">Memuat arsip…</p>}
    {error && <p className="error-message" role="alert">{error} <button disabled={loading} onClick={() => void load(data?.nextBefore ?? undefined)}>Coba lagi</button></p>}
    {playError && <p className="error-message" role="alert">{playError}</p>}
    {data?.nextBefore && !error && <button className="secondary-button archive-more" disabled={loading || busy} onClick={() => void load(data.nextBefore!)}>Muat tanggal sebelumnya</button>}
  </div>;
}

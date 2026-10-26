import { useEffect, useId, useRef, useState } from 'react';
import { Cross2Icon, PersonIcon } from '@radix-ui/react-icons';
import type { DiscordRoomProgress } from '@nyambung/shared';
import { api } from './api';
import { platform } from './platform';
type Participant = DiscordRoomProgress['participants'][number];
export function DiscordAvatar({ player }: { player: Pick<Participant,'id'|'name'|'avatar'> }) {
  const prefix = location.pathname.startsWith('/.proxy/') ? '/.proxy' : '';
  const image = player.avatar && /^[\da-f_]+$/i.test(player.avatar)
    ? `/avatars/${player.id}/${player.avatar}.png?size=64`
    : /^\d+$/.test(player.id) ? `/embed/avatars/${Number((BigInt(player.id) >> 22n) % 6n)}.png` : null;
  return <span className="player-avatar" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}{image && <img alt="" src={`${prefix}/discord-cdn${image}`} onError={event => { event.currentTarget.hidden = true; }}/>}</span>;
}
export function DiscordRoom({ ready, revision, runId }: { ready: boolean; revision: number; runId?: string }) {
  const [room, setRoom] = useState<DiscordRoomProgress | null>(null);
  const [error, setError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    if (!ready || !platform.instanceId) return;
    let stopped = false, loading = false;
    const update = async () => {
      if (document.hidden || stopped || loading) return;
      loading = true;
      try { const data = await api<DiscordRoomProgress>(`/discord/instances/${encodeURIComponent(platform.instanceId!)}/progress${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`); if (!stopped) { setRoom(data); setError(''); } }
      catch (e) { if (!stopped) setError((e as Error).message); }
      finally { loading = false; }
    };
    const listener = () => { void update(); };
    listener(); const timer = setInterval(listener, 5000);
    const unsubscribe = platform.onParticipantsChanged?.(listener);
    document.addEventListener('visibilitychange', listener);
    return () => { stopped = true; clearInterval(timer); unsubscribe?.(); document.removeEventListener('visibilitychange', listener); };
  }, [ready, revision, runId]);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  async function invite() {
    setInviting(true); setInviteError('');
    try { await platform.invite?.(); }
    catch (e) { setInviteError((e as Error).message); }
    finally { setInviting(false); }
  }
  const preview = room ? [...room.participants].sort((a, b) => Number(b.id === platform.userId) - Number(a.id === platform.userId)).slice(0, 3) : [];
  return <><button className="room-trigger" disabled={!ready} onClick={() => setOpen(true)} aria-label="Pemain di Activity" title={room && !error ? `${room.participants.length} pemain aktif · diperbarui otomatis` : 'Menghubungkan pemain…'} data-live={!!room && !error}><span className="room-avatar-stack">{preview?.length ? preview.map(player => <DiscordAvatar key={player.id} player={player}/>) : <PersonIcon width={17} height={17}/>}</span><span className="room-player-count">{room?.participants.length ?? '-'} aktif</span><span className="room-live-badge" aria-hidden="true">{room?.participants.length ?? '-'}</span></button>{open && <dialog ref={dialog} className="modal discord-room" aria-labelledby={title} onClose={() => setOpen(false)} onCancel={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) setOpen(false); }}><div className="modal-inner"><header><h2 id={title}>Pemain di Activity</h2><button className="icon-button" aria-label="Tutup" onClick={() => setOpen(false)}><Cross2Icon/></button></header><p className="room-live-summary" role="status" data-live={!!room && !error}><span className="live-dot"/>{error ? 'Memperbarui daftar pemain…' : room ? `Live · ${room.participants.length} pemain di Activity` : 'Memuat pemain…'}</p><p className="help-small">Daily {room?.number ? `#${String(room.number).padStart(3, '0')}` : 'hari ini'} · Jawaban masing-masing.</p>{error && <p className="error-message" role="status">{error}</p>}<ul className="room-players" aria-label="Pemain aktif">{room?.participants.map(player => <li key={player.id}><DiscordAvatar player={player}/><div><strong>{player.name}{player.id === platform.userId ? ' (kamu)' : ''}</strong><span>{player.completed ? 'Selesai' : `${player.stages}/5 babak`}</span></div><b>{player.total !== null ? `${player.total.toLocaleString('id-ID')} poin` : '-'}</b></li>)}</ul>{room?.participants.length === 0 && !error && <p className="help-small">Belum ada pemain lain yang terhubung.</p>}{!room && !error && <p role="status">Memuat pemain…</p>}<button className="primary-button full-button" disabled={inviting} onClick={() => void invite()}>{inviting ? 'Membuka undangan…' : 'Undang teman'}</button>{inviteError && <p className="error-message" role="alert">{inviteError}</p>}</div></dialog>}</>;
}

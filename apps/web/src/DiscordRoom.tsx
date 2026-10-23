import { useEffect, useId, useRef, useState } from 'react';
import { Cross2Icon, PersonIcon } from '@radix-ui/react-icons';
import type { DiscordRoomProgress } from '@nyambung/shared';
import { api } from './api';
import { platform } from './platform';
export function DiscordRoom({ ready, revision }: { ready: boolean; revision: number }) {
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
      try { const data = await api<DiscordRoomProgress>(`/discord/instances/${encodeURIComponent(platform.instanceId!)}/progress`); if (!stopped) { setRoom(data); setError(''); } }
      catch (e) { if (!stopped) setError((e as Error).message); }
      finally { loading = false; }
    };
    const listener = () => { void update(); };
    listener(); const timer = setInterval(listener, 5000);
    const unsubscribe = platform.onParticipantsChanged?.(listener);
    document.addEventListener('visibilitychange', listener);
    return () => { stopped = true; clearInterval(timer); unsubscribe?.(); document.removeEventListener('visibilitychange', listener); };
  }, [ready, revision]);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  async function invite() {
    setInviting(true); setInviteError('');
    try { await platform.invite?.(); }
    catch (e) { setInviteError((e as Error).message); }
    finally { setInviting(false); }
  }
  return <><button className="room-trigger" disabled={!ready} onClick={() => setOpen(true)} aria-label="Pemain di Activity"><PersonIcon width={17} height={17}/><span>{room?.participants.length ?? '—'} pemain</span></button>{open && <dialog ref={dialog} className="modal discord-room" aria-labelledby={title} onCancel={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) setOpen(false); }}><div className="modal-inner"><header><h2 id={title}>Pemain di Activity</h2><button className="icon-button" aria-label="Tutup" onClick={() => setOpen(false)}><Cross2Icon/></button></header><p className="help-small">Daily {room?.number ? `#${String(room.number).padStart(3, '0')}` : 'hari ini'} · Jawaban masing-masing.</p>{error && <p className="error-message" role="status">{error}</p>}<ul className="room-players">{room?.participants.map(player => <li key={player.id}><span className="player-avatar">{player.name.slice(0, 1).toUpperCase()}{player.avatar && /^[\da-f_]+$/i.test(player.avatar) && <img alt="" src={`${location.pathname.startsWith('/.proxy/') ? '/.proxy' : ''}/discord-cdn/avatars/${player.id}/${player.avatar}.png?size=64`} onError={event => { event.currentTarget.hidden = true; }}/>}</span><div><strong>{player.name}{player.id === platform.userId ? ' (kamu)' : ''}</strong><span>{player.completed ? 'Selesai' : `${player.stages}/5 babak`}</span></div><b>{player.total !== null ? `${player.total.toLocaleString('id-ID')} poin` : '—'}</b></li>)}</ul>{!room && !error && <p role="status">Memuat pemain…</p>}<button className="primary-button full-button" disabled={inviting} onClick={() => void invite()}>{inviting ? 'Membuka undangan…' : 'Undang teman'}</button>{inviteError && <p className="error-message" role="alert">{inviteError}</p>}</div></dialog>}</>;
}

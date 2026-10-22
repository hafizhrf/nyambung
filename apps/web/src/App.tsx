import { useEffect, useLayoutEffect, useRef, useState, useId, type FormEvent, type ReactNode } from 'react';
import { ArrowRightIcon, PlayIcon, BarChartIcon, CheckIcon, ChevronLeftIcon, QuestionMarkCircledIcon, ClockIcon, CopyIcon, Link2Icon, ReloadIcon, SpeakerLoudIcon, SpeakerOffIcon, Cross2Icon } from '@radix-ui/react-icons';
import gsap from 'gsap';
import { stageNames, type GameMode, type RandomView, type DailyView, type RunView, type StageResult, type Stats } from '@nyambung/shared';
import { api } from './api';
import { browserPlatform } from './platform';
import { useGameAudio } from './sound';
import { Comparison } from './Comparison';

const num = (n: number) => n.toLocaleString('id-ID');
const dateLabel = (date: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${date}T12:00:00+07:00`));
function countdown(end: string, offset: number) {
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.now() - offset) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
function Chain({ value = 1, small = false }: { value?: number; small?: boolean }) {
  return <svg className={small ? 'chain chain-small' : 'chain'} viewBox="0 0 180 30" fill="none" aria-hidden="true"><path d="M4 15C35 -3 58 33 90 15S145 -3 176 15" stroke="currentColor" strokeOpacity=".15" strokeWidth="2" strokeLinecap="round"/><path d="M4 15C35 -3 58 33 90 15S145 -3 176 15" pathLength="1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${Math.max(.01,value)} 1`}/></svg>;
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}><div className="modal-inner"><header><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Tutup" onClick={close}><Cross2Icon width={20} height={20} aria-hidden="true"/></button></header>{children}</div></dialog>;
}
function ConnectionBoard({ clues, answer, connections, similarities, result, motion }: { clues: string[]; answer?: string | null; connections?: number[]; similarities?: number[]; result?: StageResult; motion: boolean }) {
  const goldId = useId().replace(/:/g, '');
  const reward = !!result && !result.skipped && (result.score > 950 || (result.rank !== undefined && result.rank >= 1 && result.rank <= 10));
  const rewardLabel = result?.score === 1000 ? result.connections.every(value => value >= .999) ? 'Sambungan sempurna' : 'Sambungan terkuat' : result?.rank && result.rank <= 10 ? '10 besar' : 'Sambungan kuat';
  const board = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{width:number;height:number;paths:string[]}>({width:600,height:100,paths:[]});
  useLayoutEffect(() => {
    const root=board.current;if(!root) return;
    const branches=root.querySelector<HTMLElement>('.connection-branches')!;
    const answer=root.querySelector<HTMLElement>('.answer-node')!;
    const measure=()=>{
      const box=branches.getBoundingClientRect();
      if(!box.width || !box.height) return;
      const endX=answer.offsetLeft+answer.offsetWidth/2-branches.offsetLeft, endY=answer.offsetTop-branches.offsetTop+1;
      const paths=Array.from(root.querySelectorAll('.clue')).map(clue=>{
        const rect=clue.getBoundingClientRect();
        const x=rect.left+rect.width/2-box.left,y=rect.bottom-box.top-1;
        const distance=endY-y;
        return `M${x} ${y} C${x} ${y+distance*.6} ${endX} ${endY-distance*.6} ${endX} ${endY}`;
      });
      setGeometry(previous=>previous.width===box.width && previous.height===box.height && previous.paths.join()===paths.join() ? previous : {width:box.width,height:box.height,paths});
    };
    measure();
    const observer=new ResizeObserver(measure);
    [root,branches,answer,...root.querySelectorAll('.clue')].forEach(element=>observer.observe(element));
    return ()=>observer.disconnect();
  },[clues.join(',')]);
  useEffect(() => {
    if (!board.current || !motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      if (reward) {
        const timeline = gsap.timeline();
        timeline.fromTo('.flow-mask', { attr:{'stroke-dasharray':'0 1'} }, { attr:{'stroke-dasharray':(_i:number,element:SVGPathElement)=>`${element.dataset.strength} 1`}, duration: .65, stagger: .04, ease: 'power3.out' })
          .fromTo('.answer-node', { scale: .96 }, { scale: 1, duration: .32, ease: 'back.out(2)' }, .28)
          .fromTo('.reward-ring', { scale: .85, opacity: .65 }, { scale: 1.3, opacity: 0, duration: .4 }, .3)
          .fromTo('.reward-rays', { scale: .65, opacity: 0 }, { scale: 1, opacity: 1, duration: .2 }, .3)
          .to('.reward-rays', { opacity: 0, duration: .2 }, .5);
      }
      if (answer !== undefined && !reward) gsap.fromTo('.flow-mask', { attr:{'stroke-dasharray':'0 1'} }, { attr:{'stroke-dasharray':(_i:number,element:SVGPathElement)=>`${element.dataset.strength} 1`}, duration: .55, stagger: .04, ease: 'power3.out' });
    }, board);
    return () => ctx.revert();
  }, [clues.join(','), answer, reward, motion]);
  useEffect(() => {
    if (!board.current || !motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.flow-base', { opacity: .2 }, { opacity: 1, duration: .6, stagger: .06, ease: 'power2.out' });
    }, board);
    return () => ctx.revert();
  }, [clues.join(','), motion]);
  return <div ref={board} className={`connection-board ${clues.length === 3 ? 'three-clues' : ''} ${reward ? 'reward-board' : ''} ${motion ? 'flow-motion' : ''}`} data-reward={reward ? 'gold' : 'none'}>
    <div className="clue-grid">{clues.map((clue, i) => <div className="clue-branch" key={clue}><div className={`clue clue-${i}`}><span className="micro">{clues.length === 1 ? 'KATA HARI INI' : `PETUNJUK 0${i + 1}`}</span><strong>{clue}</strong><small className="clue-strength" aria-hidden={!connections} title={similarities ? `Cosine similarity: ${similarities[i].toFixed(3)}` : undefined}>{connections ? `${Math.round(connections[i] * 100)}% terhubung` : '\u00a0'}</small></div></div>)}</div>
    <div className="connection-branches"><svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" fill="none" aria-hidden="true"><defs><linearGradient id={goldId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={geometry.height}><stop stopColor="#e7b64c"/><stop offset=".5" stopColor="#fff0b5"/><stop offset="1" stopColor="#b47d18"/></linearGradient></defs>{geometry.paths.map((path, i) => {
      const clue=clues[i];
      const strength = Math.max(0,Math.min(1,connections?.[i] ?? 0));
      const color = reward ? `url(#${goldId})` : '#1c7af8';
      const maskId=`${goldId}-connection-${i}`;
      return <g key={clue ?? i} data-connection={i}>
        <path className="flow-base" d={path} pathLength="1" stroke="#d8e5f9" strokeWidth="2"/>
        {strength > 0 && <>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-20" y="-20" width={geometry.width+40} height={geometry.height+40}>
            <path className="flow-mask" d={path} pathLength="1" fill="none" stroke="white" strokeWidth="28" strokeDasharray={`${strength} 1`} data-strength={strength}/>
          </mask>
          <g mask={`url(#${maskId})`}>
            <path className="flow-glow" d={path} pathLength="1" stroke={color} strokeWidth={reward ? 10 : 6}/>
            <path className="flow-progress lit-link" d={path} pathLength="1" stroke={color} strokeWidth={reward ? 3 : 2.5}/>
            <path className="flow-pulse" d={path} pathLength="1" stroke={color} strokeWidth={reward ? 4 : 2} strokeDasharray=".055 .945" style={{animationDelay:`${i * -.7}s`}}/>
          </g>
        </>}
        {connections === undefined && <path className="flow-pulse" d={path} pathLength="1" stroke={color} strokeWidth="2" strokeDasharray=".055 .945" style={{animationDelay:`${i * -.7}s`}}/>}
      </g>;
    })}</svg></div>
    <div className={`answer-node ${answer !== undefined ? 'answered' : ''}`}>{reward && <><span className="reward-ring" aria-hidden="true"/><svg className="reward-rays" viewBox="0 0 280 150" aria-hidden="true"><g stroke="#c88c20" strokeWidth="2" strokeLinecap="round"><path d="M20 55l-12-6m19 36-14 3m242-33 12-6m-19 36 14 3M75 10l-5-8m135 8 5-8M75 140l-5 8m135-8 5 8"/></g></svg></>}<span className="micro">{answer !== undefined ? 'KATAMU' : 'SATU KATA PENGHUBUNG'}</span><strong>{answer === null ? 'dilewati' : answer || '?'}</strong></div><span className="reward-label" aria-hidden={!reward}>{reward ? <>{rewardLabel}</> : '\u00a0'}</span>
  </div>;
}
function AnimatedScore({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = ref.current; if (!target) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off') { target.textContent = num(value); return; }
    const counter = { value: 0 }; const tween = gsap.to(counter, { value, duration: .65, ease: 'power2.out', onUpdate: () => { target.textContent = num(Math.round(counter.value)); } });
    return () => { tween.kill(); };
  }, [value]);
  return <span ref={ref}>{num(value)}</span>;
}
function shareText(run: RunView) {
  const squares = run.results.map(r => r.score >= 900 ? '🟦' : r.score >= 600 ? '🟩' : r.score >= 300 ? '🟨' : '⬜').join('');
  return `Nyambung ${run.mode === 'random' ? 'Acak' : `#${run.number}`} · ${run.date}\n${squares}\n${num(run.total)} / 5.000\n${location.origin}`;
}
export default function App() {
  const sound = useGameAudio();
  const [mode, setMode] = useState<GameMode>(() => { try { return localStorage.getItem('nyambung-mode') === 'random' ? 'random' : 'daily'; } catch { return 'daily'; } });
  const [randomStatus, setRandomStatus] = useState<RandomView | null>(null);
  const [daily, setDaily] = useState<DailyView | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [page, setPage] = useState<'home' | 'game' | 'results'>('home');
  const [active, setActive] = useState(0);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState<'help' | 'stats' | 'skip' | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [shared, setShared] = useState('');
  const [shareFallback, setShareFallback] = useState(false);
  const [time, setTime] = useState('—:—:—');
  const [motion, setMotion] = useState(() => { try { return localStorage.getItem('nyambung-motion') !== 'off'; } catch { return true; } });
  const offset = useRef(0);
  const main = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const draftKey = run ? `nyambung-draft:${run.id}:${active}` : '';
  async function load() {
    setLoadError('');
    try { await browserPlatform.bootstrap(); const data = await api<DailyView>('/daily'); offset.current = Date.parse(data.serverTime) - Date.now(); setDaily(data); if (mode === 'daily') setRun(data.run);
      const random = await api<RandomView>('/random'); setRandomStatus(random); if (mode === 'random') setRun(random.run); }
    catch { setLoadError('Belum bisa terhubung. Periksa koneksimu, lalu coba lagi.'); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? innerHeight}px`);
      document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
      document.documentElement.dataset.keyboard = viewport && viewport.height < innerHeight - 120 ? 'open' : 'closed';
    };
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
    try { localStorage.setItem('nyambung-motion', motion ? 'on' : 'off'); } catch { /* optional */ }
  }, [motion]);
  useEffect(() => {
    if (!daily) return;
    let refreshing = false;
    const tick = () => {
      setTime(countdown(daily.resetsAt, offset.current));
      if (Date.now() + offset.current >= Date.parse(daily.resetsAt) && page === 'home' && !refreshing) { refreshing = true; void load(); }
    };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [daily, page, mode]);
  useEffect(() => {
    const target = main.current;
    if (!target || !motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => { gsap.fromTo('.reveal', { opacity: 0, y: 18 }, { opacity: 1, y: 0, stagger: .07, duration: .5, ease: 'power2.out', clearProps: 'all' }); }, target);
    return () => ctx.revert();
  }, [page, active, motion]);
  useEffect(() => {
    setError('');
    try { setWord(draftKey ? localStorage.getItem(draftKey) || '' : ''); } catch { setWord(''); }
    if (page === 'game' && !run?.results[active]) input.current?.focus({ preventScroll: true });
  }, [draftKey, page]);
  useEffect(() => {
    if (page === 'game' && run?.results[active]) main.current?.querySelector<HTMLButtonElement>('.next-button')?.focus({ preventScroll: true });
  }, [page, active, run?.results.length]);
  function changeWord(value: string) { setWord(value); setError(''); try { localStorage.setItem(draftKey, value); } catch { /* optional */ } }
  function rememberRun(current: RunView) {
    setRun(current);
    if (current.mode === 'daily') setDaily(previous => previous ? { ...previous, run:current } : previous);
    else setRandomStatus(previous => ({ available:previous?.available ?? true, run:current }));
  }
  function chooseMode(nextMode: GameMode) {
    setMode(nextMode); setError(''); setRun(nextMode === 'daily' ? daily?.run ?? null : randomStatus?.run ?? null);
    try { localStorage.setItem('nyambung-mode', nextMode); } catch { /* Optional preference. */ }
  }
  async function begin() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const current = await api<RunView>(mode === 'random' ? '/random/runs' : '/runs', {}); rememberRun(current); setShared(''); setShareFallback(false); setPage(current.completed ? 'results' : 'game');
      setActive(current.results.length ? current.results.length - 1 : 0);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function submit(skip = false) {
    if (!run || busy) return;
    sound.play(skip ? 'next' : 'submit');
    setBusy(true); setError(''); setModal(null);
    try {
      const updated = await api<RunView>(`/runs/${run.id}/answers`, { stage: active, word, skip });
      rememberRun(updated);
      const answer = updated.results[active];
      if (!skip && answer) sound.play(answer.score > 950 || (answer.rank !== undefined && answer.rank >= 1 && answer.rank <= 10) ? 'reward' : 'result');
      try { localStorage.removeItem(draftKey); } catch { /* optional */ }
    } catch (e) { sound.play('error'); setError((e as Error).name === 'TimeoutError' ? 'Koneksi terlalu lama. Coba kirim lagi; jawaban yang tersimpan tidak akan dihitung dua kali.' : (e as Error).message); }
    finally { setBusy(false); }
  }
  function next() { if (!run) return; sound.play('next'); setError(''); if (run.completed) setPage('results'); else setActive(run.current!.index); }
  async function showStats() {
    setModal('stats'); setStats(null); setStatsError('');
    try { setStats(await api<Stats>('/me/stats')); } catch { setStatsError('Statistik belum bisa dimuat. Tutup lalu coba lagi.'); }
  }
  async function share() {
    if (!run) return;
    try { const result = await browserPlatform.share(shareText(run)); setShared(result === 'copied' ? 'Hasil tersalin!' : 'Hasil dibagikan!'); }
    catch (e) { if ((e as Error).name !== 'AbortError') { setShareFallback(true); setShared('Salin hasilmu di bawah ini.'); } }
  }
  const result: StageResult | undefined = run?.results[active];
  const stage = result || run?.current;
  const homeRun = mode === 'random' ? randomStatus?.run : daily?.run && daily.run.demo === daily.demo ? daily.run : null;
  const available = mode === 'random' ? randomStatus?.available : daily?.available;
  return <div className="site-shell" onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock} onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button');
    if (button && !button.disabled && !(button.form && button.type === 'submit') && !button.hasAttribute('data-custom-sound')) sound.play('tap');
  }}>
    <header className="site-header"><button className="brand" onClick={() => { setPage('home'); setError(''); }} aria-label="Nyambung, beranda"><span className="brand-icon"><Link2Icon width={25} height={25} aria-hidden="true"/></span>nyambung<span className="brand-period">.</span></button><nav aria-label="Menu utama"><button className="icon-button" onClick={() => setModal('help')} aria-label="Cara bermain"><QuestionMarkCircledIcon width={21} height={21} aria-hidden="true"/></button><button className="icon-button" onClick={() => void showStats()} aria-label="Statistik"><BarChartIcon width={21} height={21} aria-hidden="true"/></button></nav></header>
    <main ref={main} id="main-content" tabIndex={-1}>
      {page === 'home' && <section className="daily-lobby reveal" aria-labelledby="daily-title">
        <div className="mode-picker" role="group" aria-label="Mode permainan"><button aria-pressed={mode === 'daily'} disabled={busy} onClick={() => chooseMode('daily')}>Daily</button><button aria-pressed={mode === 'random'} disabled={busy} onClick={() => chooseMode('random')}>Acak</button></div>
        <div className="lobby-date">{mode === 'random' ? 'Main kapan saja · bisa diulang' : daily ? dateLabel(daily.date) : 'Memuat…'}</div>
        <h1 id="daily-title">{mode === 'random' ? 'Main acak' : `Daily #${daily?.number ? String(daily.number).padStart(3, '0') : '—'}`}</h1>
        <p className="lobby-instruction">Cari satu kata yang menghubungkan petunjuk.</p>
        <ol className="lobby-stages" aria-label="Lima babak">{['Dua kata', 'Dua kata', 'Dua kata', 'Tiga kata', 'Dekat makna'].map((label, i) => <li key={i}><span className="lobby-stage-number">{homeRun?.results[i] ? <CheckIcon width={16} height={16} aria-hidden="true"/> : `0${i + 1}`}</span><span>{label}</span><span className="lobby-stage-symbol" aria-hidden="true">{i === 3 ? '⋮' : i === 4 ? '≈' : '↔'}</span></li>)}</ol>
        <div className="lobby-rules"><span>1 tebakan per babak</span><span>Maks. 5.000 poin</span></div>
        <button className="primary-button lobby-play" disabled={!available || busy} onClick={() => void begin()}>{busy ? <ReloadIcon className="spin" width={20} height={20} aria-hidden="true"/> : homeRun?.completed ? mode === 'random' ? 'Main lagi' : 'Lihat hasilmu' : homeRun ? 'Lanjutkan bermain' : 'Main'}{!busy && <ArrowRightIcon width={20} height={20} aria-hidden="true"/>}</button>
        {!available && daily && <p className="card-message">{mode === 'random' ? 'Soal acak belum tersedia.' : 'Puzzle hari ini belum tersedia.'}</p>}
        {mode === 'daily' && daily?.demo && <p className="lobby-demo">Demo · skor contoh</p>}
        {(error || loadError) && <p className="error-message" role="alert">{error || loadError} {loadError && <button onClick={() => void load()}>Coba lagi</button>}</p>}
      </section>}
      {page === 'game' && run && stage && <section className="game-page">
        <div className="game-topline reveal"><button className="text-button" onClick={() => setPage('home')}><ChevronLeftIcon width={16} height={16} aria-hidden="true"/> Beranda</button><span>{run.mode === 'random' ? 'MODE ACAK' : `DAILY #${String(run.number).padStart(3, '0')}`} <span className="topline-divider">/</span> {dateLabel(run.date)}</span><span className="total-pill">{num(run.total)} poin</span></div>
        <div className="stage-progress reveal" aria-label={`Stage ${active + 1} dari 5`}>{Array.from({ length: 5 }, (_, i) => <div key={i} className={`${i === active ? 'current' : ''} ${run.results[i] ? 'done' : ''}`}><span>{run.results[i] ? <CheckIcon width={14} height={14} aria-hidden="true"/> : `0${i + 1}`}</span><i/></div>)}</div>
        <div className="game-heading reveal"><h1>Babak {active + 1} · {stageNames[stage.kind]}</h1><p>{stage.kind === 'closest' ? 'Cari kata lain dengan makna terdekat.' : `Cari satu kata yang menghubungkan ${stage.clues.length === 3 ? 'ketiga' : 'kedua'} petunjuk.`}</p></div>
        <div className="game-paper reveal" aria-busy={busy}><ConnectionBoard clues={stage.clues} answer={result ? result.word : undefined} connections={result?.connections} similarities={result?.similarities} result={result} motion={motion}/>{!result ? <form className="answer-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }}><label htmlFor="answer">SATU KATA VERSIMU</label><div className={`input-wrap ${error ? 'input-error' : ''}`}><input ref={input} id="answer" value={word} onChange={e => changeWord(e.target.value)} placeholder="Kayaknya…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} readOnly={busy} aria-describedby={error ? 'answer-error' : 'answer-note'}/><button type="submit" className="primary-button" disabled={!word.trim() || busy}>{busy ? <ReloadIcon width={19} height={19} aria-hidden="true" className="spin"/> : <>Sambungkan <ArrowRightIcon width={18} height={18} aria-hidden="true"/></>}</button></div><div className="input-meta"><span id="answer-note">Satu kata. Satu kesempatan. Hingga 1.000 poin.</span><button type="button" className="text-button" disabled={busy} onClick={() => setModal('skip')}>Lewati babak </button></div>{error && <p id="answer-error" className="error-message" role="alert">{error}</p>}</form> : <div className="stage-result" role="region" aria-label="Hasil tebakan" tabIndex={-1}><div className="score-block"><span className="micro">KEKUATAN KONEKSIMU</span><strong><AnimatedScore value={result.score}/><small> / 1.000</small></strong>{result.rank && <p className="rank-note">Peringkat <b>#{num(result.rank)}</b> dari {num(result.vocabularySize!)} kata</p>}</div><div className="best-answer"><span className="micro">SALAH SATU SAMBUNGAN TERBAIK</span><strong>{result.best} </strong>{run.mode !== 'random' && result.explanation && <p>{result.explanation}</p>}</div><button className="primary-button next-button" data-custom-sound onClick={next}>{run.completed ? 'Lihat hasil akhir' : 'Lanjut ke babak berikutnya'}<ArrowRightIcon width={19} height={19} aria-hidden="true"/></button></div>}</div>
        <p className="game-footnote">{run.demo ? 'MODE DEMO · Skor menggunakan contoh kurasi, belum embedding semantik.' : ''}</p>
      </section>}
      {page === 'results' && run && <section className="results-page"><div className="result-kicker reveal"> {run.mode === 'random' ? 'MODE ACAK' : `DAILY #${String(run.number).padStart(3, '0')}`} · {dateLabel(run.date)}</div><h1 className="reveal">{run.mode === 'random' ? 'Hasil acak' : 'Hasil daily'}</h1><div className="grand-score reveal"><span className="micro">TOTAL KONEKSIMU</span><strong><AnimatedScore value={run.total}/><small> / 5.000</small></strong><span className="score-underline"/></div>{run.mode === 'daily' && <Comparison runId={run.id}/>}<div className="results-list reveal">{run.results.map((r, i) => <div className="result-row" key={i}><span className="result-index">0{i + 1}</span><div className="result-words"><span>{r.clues.join(' / ')}</span><strong>{r.word || 'dilewati'}</strong><small>Terbaik: {r.best}</small></div><Chain value={r.score / 1000} small/><strong className="row-score">{num(r.score)}</strong></div>)}</div><div className="result-actions reveal"><button className="primary-button" onClick={() => void share()}>{shared && !shareFallback ? <CheckIcon width={18} height={18} aria-hidden="true"/> : <CopyIcon width={18} height={18} aria-hidden="true"/>}Bagikan hasil</button><button className="secondary-button" onClick={() => void showStats()}><BarChartIcon width={18} height={18} aria-hidden="true"/> Statistikmu</button></div><p className="share-status" data-shared={!!shared} role="status">{shared || 'Tanpa spoiler. Biar temanmu ikut penasaran.'}</p>{shareFallback && <textarea className="share-fallback" readOnly aria-label="Teks hasil untuk disalin" value={shareText(run)} onFocus={e => e.target.select()}/>}{run.mode === 'random' ? <div className="next-daily random-next"><span role={error ? 'alert' : undefined}>{error ? 'Belum bisa memulai. Coba lagi.' : 'Soal baru, lima babak lagi.'}</span><button className="primary-button" disabled={busy} onClick={() => void begin()}>Main lagi <ArrowRightIcon width={15} height={15} aria-hidden="true"/></button></div> : <div className="next-daily"><ClockIcon width={18} height={18} aria-hidden="true"/><span>{time === '00:00:00' ? 'Daily baru sudah tersedia.' : <>Daily berikutnya dalam <strong>{time}</strong></>}</span><button className="text-button" onClick={() => { setPage('home'); void load(); }}>Beranda <ArrowRightIcon width={15} height={15} aria-hidden="true"/></button></div>}{run.demo && <p className="demo-note">Mode demo · hasil ini memakai skor kurasi contoh.</p>}</section>}
    </main>
    <footer className="site-footer"><span>{mode === 'random' ? 'Mode acak · tanpa batas harian' : 'Daily berganti pukul 00.00 WIB'}</span><div>{page === 'home' && mode === 'daily' && daily && <span className="footer-countdown"> KATA BARU DALAM <b>{time}</b></span>}<button className="motion-button sound-button" data-custom-sound aria-label="Suara" aria-pressed={sound.enabled} onClick={sound.toggle}>{sound.enabled ? <SpeakerLoudIcon width={15} height={15} aria-hidden="true"/> : <SpeakerOffIcon width={15} height={15} aria-hidden="true"/>} Suara {sound.enabled ? 'on' : 'off'}</button><button className="motion-button" aria-pressed={motion} onClick={() => setMotion(!motion)}><PlayIcon width={15} height={15} aria-hidden="true"/> Motion {motion ? 'on' : 'off'}<span className={`toggle ${motion ? 'enabled' : ''}`}/></button></div></footer>
    {modal === 'help' && <Modal title="Biar makin nyambung." close={() => setModal(null)}><p className="modal-lead">Lima babak. Cari kata dengan hubungan paling kuat.</p><ol className="help-list"><li><strong>01—03 / Di tengah kata</strong><p>Cari satu kata yang cocok dengan dua petunjuk. Misalnya <b>makanan + mall → restoran</b>.</p></li><li><strong>04 / Tiga sambungan</strong><p>Satu jawaban untuk tiga petunjuk. Usahakan cocok dengan semuanya.</p></li><li><strong>05 / Sedekat makna</strong><p>Cari kata dengan makna terdekat. Misalnya <b>gembira → senang</b>.</p></li></ol><div className="help-note"><p>Satu tebakan valid per babak. Jawaban alternatif tetap dapat poin. Kata tidak dikenal tidak menghabiskan kesempatan. Lewati berarti nol poin.</p></div><p className="help-small">Daily berganti pukul 00.00 WIB. Mode Acak bisa diulang tanpa mengubah streak atau statistik daily. Progres tersimpan di browser ini melalui cookie anonim. Menghapus cookie atau berpindah perangkat akan membuat identitas baru.</p><button className="primary-button full-button" onClick={() => setModal(null)}>Oke, sudah nyambung <CheckIcon width={18} height={18} aria-hidden="true"/></button></Modal>}
    {modal === 'stats' && <Modal title="Cerita sambunganmu." close={() => setModal(null)}>{stats ? <><div className="stats-grid"><div><strong>{stats.completed}</strong><span>Daily selesai</span></div><div><strong>{stats.streak}</strong><span>Streak hari</span></div><div><strong>{num(stats.best)}</strong><span>Skor terbaik</span></div><div><strong>{num(stats.average)}</strong><span>Rata-rata</span></div></div><p className="help-small">Streak mengikuti tanggal puzzle dalam WIB. Selesaikan daily setiap hari untuk menjaga sambungannya. Statistik berlaku untuk identitas anonim di browser ini.</p></> : <p role="status">{statsError || 'Sedang merangkai statistik…'}</p>}</Modal>}
    {modal === 'skip' && <Modal title="Lewati sambungan ini?" close={() => setModal(null)}><p className="modal-lead">Babak ini mendapat 0 poin dan jawaban terbaik akan dibuka. Kamu tetap bisa lanjut ke babak berikutnya.</p><div className="skip-actions"><button className="secondary-button" onClick={() => setModal(null)}>Pikir lagi</button><button className="primary-button" data-custom-sound onClick={() => void submit(true)}>Ya, lewati <ArrowRightIcon width={18} height={18} aria-hidden="true"/></button></div></Modal>}
  </div>;
}

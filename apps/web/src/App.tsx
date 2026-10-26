import { useEffect, useLayoutEffect, useRef, useState, useId, type FormEvent, type ReactNode } from 'react';
import { ArrowRightIcon, CalendarIcon, ShuffleIcon, PlayIcon, BarChartIcon, CheckIcon, ChevronLeftIcon, QuestionMarkCircledIcon, ClockIcon, Share2Icon, Link2Icon, ReloadIcon, SpeakerLoudIcon, SpeakerOffIcon, Cross2Icon, SunIcon, MoonIcon } from '@radix-ui/react-icons';
import gsap from 'gsap';
import { type GameMode, type RandomView, type DailyView, type RunView, type StageResult, type Stats } from '@nyambung/shared';
import { api } from './api';
import { platform } from './platform';
import { DiscordRoom } from './DiscordRoom';
import { DiscordScores } from './DiscordScores';
import { ActivityLoading } from './ActivityLoading';
import { ActivityMini } from './ActivityMini';
import { useActivityLayout } from './useActivityLayout';
import { useGameAudio } from './sound';
import { Comparison } from './Comparison';
import { DailyArchive } from './DailyArchive';
import { ShareResult } from './ShareResult';
import { morphAnswerInput } from './answerTransition';
import { enterPage, leaveRound } from './pageTransitions';
import { resultWave } from './resultWave';

const num = (n: number) => n.toLocaleString('id-ID');
const dateLabel = (date: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${date}T12:00:00+07:00`));
function countdown(end: string, offset: number) {
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.now() - offset) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
function Chain({ value = 1, small = false, variant = 0 }: { value?: number; small?: boolean; variant?: number }) {
  const clipId = useId().replace(/:/g,'');
  const strength = Math.max(0,Math.min(1,value));
  const path = resultWave(variant,strength);
  return <svg className={small ? 'chain chain-small' : 'chain'} viewBox="0 0 180 30" preserveAspectRatio="none" fill="none" aria-hidden="true"><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect className="result-wave-clip" data-strength={strength} width={180 * strength} height="30"/></clipPath></defs><path className="result-wave-track" d={path} stroke="currentColor" strokeOpacity=".15" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>{strength > 0 && <path className="result-wave-progress" d={path} clipPath={`url(#${clipId})`} stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>}</svg>;
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}><div className="modal-inner"><header><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Tutup" onClick={close}><Cross2Icon width={20} height={20} aria-hidden="true"/></button></header>{children}</div></dialog>;
}
function ConnectionBoard({ clues, answer, connections, similarities, result, motion }: { clues: string[]; answer?: string | null; connections?: number[]; similarities?: number[]; result?: StageResult; motion: boolean }) {
  const flowId = useId().replace(/:/g, '');
  const reward = !!result && !result.skipped && (result.score > 950 || (result.rank !== undefined && result.rank >= 1 && result.rank <= 10));
  const perfect = !!result && !result.skipped && result.score === 1000;
  const rewardLabel = perfect ? 'Sambungan sempurna' : result?.rank && result.rank <= 10 ? '10 besar' : 'Sambungan kuat';
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
        timeline.fromTo('.flow-fill', { attr:{'stroke-dasharray':'0 1'} }, { attr:{'stroke-dasharray':(_i:number,element:SVGPathElement)=>`${element.dataset.strength} 1`}, duration: .65, stagger: .04, ease: 'power3.out' })
          .fromTo('.answer-node', { scale: .96 }, { scale: 1, duration: .32, ease: 'back.out(2)' }, .28)
          .fromTo('.reward-ring', { scale: .85, opacity: .65 }, { scale: 1.3, opacity: 0, duration: .4 }, .3)
          .fromTo('.reward-rays', { scale: .65, opacity: 0 }, { scale: 1, opacity: 1, duration: .2 }, .3)
          .to('.reward-rays', { opacity: 0, duration: .2 }, .5);
        if (result?.score === 1000) timeline.to('.clue, .answer-node', { keyframes:[{x:-3},{x:3},{x:-2},{x:2},{x:0}], duration:.32, ease:'none' }, .25);
      }
      if (answer !== undefined && !reward) gsap.fromTo('.flow-fill', { attr:{'stroke-dasharray':'0 1'} }, { attr:{'stroke-dasharray':(_i:number,element:SVGPathElement)=>`${element.dataset.strength} 1`}, duration: .55, stagger: .04, ease: 'power3.out' });
    }, board);
    return () => ctx.revert();
  }, [clues.join(','), answer, reward, perfect, motion]);
  useEffect(() => {
    if (!board.current || !motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.flow-base', { opacity: .2 }, { opacity: 1, duration: .6, stagger: .06, ease: 'power2.out' });
    }, board);
    return () => ctx.revert();
  }, [clues.join(','), motion]);
  return <div ref={board} className={`connection-board ${clues.length === 3 ? 'three-clues' : ''} ${reward ? 'reward-board' : ''} ${perfect ? 'perfect-board' : ''} ${motion ? 'flow-motion' : ''}`} data-reward={perfect ? 'green' : reward ? 'blue' : 'none'}>
    <div className="clue-grid">{clues.map((clue, i) => <div className="clue-branch" key={clue}><div className={`clue clue-${i}`}><span className="micro">{clues.length === 1 ? 'KATA HARI INI' : `PETUNJUK 0${i + 1}`}</span><strong>{clue}</strong><small className="clue-strength" aria-hidden={!connections} title={similarities ? `Cosine similarity: ${similarities[i].toFixed(3)}` : undefined}>{connections ? `${Math.round(connections[i] * 100)}% terhubung` : '\u00a0'}</small></div></div>)}</div>
    <div className="connection-branches"><svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" fill="none" aria-hidden="true"><defs><linearGradient id={flowId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={geometry.height}><stop stopColor={perfect ? '#16a34a' : '#1c7af8'}/><stop offset=".5" stopColor={perfect ? '#86efac' : '#68a5ff'}/><stop offset="1" stopColor={perfect ? '#16a34a' : '#1c7af8'}/></linearGradient></defs>{geometry.paths.map((path, i) => {
      const clue=clues[i];
      const strength = Math.max(0,Math.min(1,connections?.[i] ?? 0));
      const color = reward ? `url(#${flowId})` : '#1c7af8';
      return <g key={clue ?? i} data-connection={i}>
        <path className="flow-base" d={path} pathLength="1" stroke="#d8e5f9" strokeWidth="2"/>
        {strength > 0 && <>
          <path className="flow-glow flow-fill" d={path} pathLength="1" stroke={color} strokeWidth={reward ? 8 : 6} strokeDasharray={`${strength} 1`} data-strength={strength}/>
          <path className="flow-progress flow-fill lit-link" d={path} pathLength="1" stroke={color} strokeWidth={reward ? 3 : 2.5} strokeDasharray={`${strength} 1`} data-strength={strength}/>

        </>}
        {connections === undefined && <path className="flow-pulse" d={path} pathLength="1" stroke={color} strokeWidth="2" strokeDasharray=".055 .945" style={{animationDelay:`${i * -.7}s`}}/>}
      </g>;
    })}</svg></div>
    <div className={`answer-node ${answer !== undefined ? 'answered' : ''}`}>{reward && <><span className="reward-ring" aria-hidden="true"/><svg className="reward-rays" viewBox="0 0 280 150" aria-hidden="true"><g stroke={perfect ? '#16a34a' : '#1c7af8'} strokeWidth="2" strokeLinecap="round"><path d="M20 55l-12-6m19 36-14 3m242-33 12-6m-19 36 14 3M75 10l-5-8m135 8 5-8M75 140l-5 8m135-8 5 8"/></g></svg></>}<span className="micro">{answer !== undefined ? 'Katamu' : 'Jawaban'}</span><strong>{answer === null ? 'dilewati' : answer || '?'}</strong></div><span className="reward-label" aria-hidden={!reward}>{reward ? <>{rewardLabel}</> : '\u00a0'}</span>
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
export default function App() {
  const sound = useGameAudio();
  const compactActivity=useActivityLayout();
  const [theme, setTheme] = useState<'light'|'dark'>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(`nyambung-theme:${platform.kind}`, theme); } catch { /* Storage can be blocked in embedded clients. */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101722' : '#fbfcff');
  }, [theme]);
  const [platformReady, setPlatformReady] = useState(false);
  const [activityStep,setActivityStep]=useState<'auth'|'game'|'ready'|'error'>(platform.kind==='discord'?'auth':'ready');
  const openedDiscord = useRef(false);
  const [mode, setMode] = useState<GameMode>('daily');
  const [randomStatus, setRandomStatus] = useState<RandomView | null>(null);
  const [daily, setDaily] = useState<DailyView | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [page, setPage] = useState<'home' | 'game' | 'results'>('home');
  const [active, setActive] = useState(0);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState<'help' | 'stats' | 'skip' | 'archive' | 'share' | null>(null);
  useLayoutEffect(()=>{
    document.documentElement.dataset.activityView=compactActivity?'mini':'full';
    if(compactActivity){
      (document.activeElement as HTMLElement|null)?.blur?.();
      setModal(null);
      for(const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))dialog.close();
    }
  },[compactActivity]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [time, setTime] = useState('--:--:--');
  const [motion, setMotion] = useState(() => { try { return localStorage.getItem('nyambung-motion') !== 'off'; } catch { return true; } });
  const offset = useRef(0);
  const main = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const revealAnswer = useRef(false);
  const navigating = useRef(false);
  const navigationVersion = useRef(0);
  const draftKey = run ? `nyambung-draft:${run.id}:${active}` : '';
  async function load() {
    setLoadError('');
    if(platform.kind==='discord'&&!openedDiscord.current)setActivityStep(platformReady?'game':'auth');
    try { await platform.bootstrap(); setPlatformReady(true); if(platform.kind==='discord'&&!openedDiscord.current)setActivityStep('game'); const data = await api<DailyView>('/daily'); offset.current = Date.parse(data.serverTime) - Date.now(); setDaily(data); if (mode === 'daily') setRun(data.run);
      const random = await api<RandomView>('/random'); setRandomStatus(random); if (mode === 'random') setRun(random.run);
      if (platform.kind === 'discord' && !openedDiscord.current && data.available) {
        const current = await api<RunView>('/runs', {});
        openedDiscord.current = true; setRun(current); setMode('daily'); setActive(Math.max(0, current.results.length - 1)); setPage(current.completed ? 'results' : 'game');
      } setActivityStep('ready'); }
    catch (e) { setLoadError(platform.kind === 'discord' ? (e as Error).message : 'Belum bisa terhubung. Periksa koneksimu, lalu coba lagi.'); if(platform.kind==='discord'&&!openedDiscord.current)setActivityStep('error'); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (platformReady) void platform.updatePresence?.(run); }, [platformReady, run?.id, run?.results.length, run?.completed]);
  useEffect(() => {
    const viewport = window.visualViewport;
    let restingHeight = innerHeight;
    let viewportWidth = innerWidth;
    const update = () => {
      const height = viewport?.height ?? innerHeight;
      if (viewportWidth !== innerWidth) {
        restingHeight = innerHeight;
        viewportWidth = innerWidth;
      }
      restingHeight = Math.max(restingHeight, innerHeight);
      const editing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      const layoutHeight = matchMedia('(pointer: coarse)').matches ? restingHeight : innerHeight;
      const keyboardOpen = editing && (viewport?.scale ?? 1) === 1 && layoutHeight - height > 120;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
      document.documentElement.dataset.keyboard = keyboardOpen ? 'open' : 'closed';
    };
    const onFocusIn = () => {
      update();
      requestAnimationFrame(update);
      setTimeout(update, 100);
      setTimeout(update, 250);
    };
    update(); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update); window.addEventListener('resize', update);
    document.addEventListener('focusin', onFocusIn); document.addEventListener('focusout', update);
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', onFocusIn); document.removeEventListener('focusout', update); };
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
  useLayoutEffect(() => {
    const target = main.current;
    if (!target) return;
    if (compactActivity || (platform.kind==='discord' && activityStep!=='ready')) { target.dataset.sceneState='idle'; return; }
    if (!motion || matchMedia('(prefers-reduced-motion: reduce)').matches) { target.dataset.sceneState = 'idle'; return; }
    const ctx = enterPage(target,page);
    return () => ctx.revert();
  }, [page, active, motion, activityStep, compactActivity]);
  useEffect(() => {
    setError('');
    try { setWord(draftKey ? localStorage.getItem(draftKey) || '' : ''); } catch { setWord(''); }
    if (page === 'game' && !run?.results[active]) input.current?.focus({ preventScroll: true });
  }, [draftKey, page]);
  useEffect(() => {
    if (page === 'game' && run?.results[active]) main.current?.querySelector<HTMLButtonElement>('.next-button')?.focus({ preventScroll: true });
  }, [page, active, run?.results.length]);
  useLayoutEffect(() => {
    if (!revealAnswer.current || !main.current) return;
    revealAnswer.current = false;
    if (!motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.stage-result .score-block, .stage-result .best-answer',
        { opacity:0, y:10 }, { opacity:1, y:0, duration:.36, stagger:.09, delay:.06, ease:'power3.out', clearProps:'opacity,transform' });
    }, main);
    return () => ctx.revert();
  }, [run?.id, run?.results.length, active, page, motion]);
  function changeWord(value: string) { setWord(value); setError(''); try { localStorage.setItem(draftKey, value); } catch { /* optional */ } }
  function rememberRun(current: RunView) {
    setRun(current);
    if (current.mode === 'daily') setDaily(previous => previous?.date === current.date ? { ...previous, run:current } : previous);
    else setRandomStatus(previous => ({ available:previous?.available ?? true, run:current }));
  }
  function goHome() {
    navigationVersion.current++;
    setMode('daily'); setRun(daily?.run ?? null); setPage('home'); setError('');
  }
  async function begin(nextMode: GameMode = mode, date?: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const current = await api<RunView>(nextMode === 'random' ? '/random/runs' : '/runs', date && nextMode === 'daily' ? { date } : {}); setMode(nextMode); rememberRun(current); setModal(null); setPage(current.completed ? 'results' : 'game');
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
      const answer = updated.results[active];
      const field = input.current?.closest<HTMLElement>('.input-wrap');
      if (!skip && answer && field && motion && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await morphAnswerInput(field, updated.completed ? 'Hasil' : 'Lanjut', answer.score === 1000);
        revealAnswer.current = true;
      }
      rememberRun(updated);
      if (!skip && answer) sound.play(answer.score > 950 || (answer.rank !== undefined && answer.rank >= 1 && answer.rank <= 10) ? 'reward' : 'result');
      try { localStorage.removeItem(draftKey); } catch { /* optional */ }
    } catch (e) { sound.play('error'); setError((e as Error).name === 'TimeoutError' ? 'Koneksi terlalu lama. Coba kirim lagi; jawaban yang tersimpan tidak akan dihitung dua kali.' : (e as Error).message); }
    finally { setBusy(false); }
  }
  async function next() {
    if (!run || busy || navigating.current) return;
    navigating.current = true;
    const version = navigationVersion.current;
    setBusy(true); sound.play('next'); setError('');
    try {
      if (main.current && motion && !matchMedia('(prefers-reduced-motion: reduce)').matches) await leaveRound(main.current);
      if (version !== navigationVersion.current) return;
      if (run.completed) setPage('results'); else setActive(run.current!.index);
    } finally { navigating.current = false; setBusy(false); }
  }
  async function showStats() {
    setModal('stats'); setStats(null); setStatsError('');
    try { setStats(await api<Stats>('/me/stats')); } catch { setStatsError('Statistik belum bisa dimuat. Tutup lalu coba lagi.'); }
  }
  const result: StageResult | undefined = run?.results[active];
  const stage = result || run?.current;
  const homeRun = daily?.run && daily.run.demo === daily.demo ? daily.run : null;
  const available = daily?.available;
  const pastDaily = run?.mode === 'daily' && !!daily && run.date < daily.date;
  const openingActivity=platform.kind==='discord'&&activityStep!=='ready';
  return <><div className="site-shell" style={compactActivity?{display:'none'}:undefined} inert={compactActivity||undefined} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock} onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button');
    if (button && !button.disabled && !(button.form && button.type === 'submit') && !button.hasAttribute('data-custom-sound')) sound.play('tap');
  }}>
    <header className="site-header"><button className="brand" onClick={goHome} aria-label="Nyambung, beranda"><span className="brand-icon"><Link2Icon width={25} height={25} aria-hidden="true"/></span>nyambung<span className="brand-period">.</span></button><nav aria-label="Menu utama">{platform.kind === 'discord' && !openingActivity && <DiscordRoom ready={platformReady} revision={run?.results.length ?? 0} runId={run?.id}/>}<button className="icon-button theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Gunakan tema terang' : 'Gunakan tema gelap'} title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}>{theme === 'dark' ? <SunIcon width={20} height={20} aria-hidden="true"/> : <MoonIcon width={20} height={20} aria-hidden="true"/>}</button><button className="icon-button" onClick={() => setModal('help')} aria-label="Cara bermain"><QuestionMarkCircledIcon width={21} height={21} aria-hidden="true"/></button>{!openingActivity && <button className="icon-button" onClick={() => void showStats()} aria-label="Statistik"><BarChartIcon width={21} height={21} aria-hidden="true"/></button>}</nav></header>
    <main ref={main} id="main-content" tabIndex={-1}>
      {openingActivity && <ActivityLoading step={activityStep === 'game' ? 'game' : activityStep === 'error' ? 'error' : 'auth'} error={loadError} retry={() => void load()}/>}
      {!openingActivity && page === 'home' && <section className="daily-lobby reveal" aria-labelledby="daily-title">
        <div className="lobby-date-row"><div className="lobby-date">{daily ? dateLabel(daily.date) : 'Memuat…'}</div><button className="archive-trigger" onClick={() => { setError(''); setModal('archive'); }}><CalendarIcon width={14} height={14} aria-hidden="true"/>Arsip Daily</button></div>
        <h1 id="daily-title">{`Daily #${daily?.number ? String(daily.number).padStart(3, '0') : '-'}`}</h1>
        <p className="lobby-instruction">Cari satu kata yang menghubungkan petunjuk.</p>
        <div className="lobby-preview" aria-label="Hujan dan panas dihubungkan dengan payung"><ConnectionBoard clues={['hujan','panas']} answer="payung" connections={[1,.8]} motion={motion}/></div>
        <div className="lobby-rules"><span>5 babak · 1 tebakan per babak</span><span>Maks. 5.000 poin</span></div>
        <button className="primary-button lobby-play" disabled={!available || busy} onClick={() => void begin('daily')}>{busy ? <ReloadIcon className="spin" width={20} height={20} aria-hidden="true"/> : homeRun?.completed ? 'Lihat hasilmu' : homeRun ? 'Lanjutkan bermain' : 'Main'}{!busy && <ArrowRightIcon width={20} height={20} aria-hidden="true"/>}</button>
        <button className="primary-button lobby-random" disabled={!randomStatus?.available || busy} onClick={() => void begin('random')}>{randomStatus?.run ? 'Lanjutkan Random Play' : 'Random Play'}<ShuffleIcon width={18} height={18} aria-hidden="true"/></button>
        {!available && daily && <p className="card-message">Puzzle hari ini belum tersedia.</p>}
        {daily?.demo && <p className="lobby-demo">Demo · skor contoh</p>}
        {(error || loadError) && <p className="error-message" role="alert">{error || loadError} {loadError && <button onClick={() => void load()}>Coba lagi</button>}</p>}
      </section>}
      {!openingActivity && page === 'game' && run && stage && <section className="game-page">
        <div className="game-topline reveal"><div className="game-context"><button className="icon-button game-back" onClick={goHome} aria-label="Beranda" title="Beranda"><ChevronLeftIcon width={18} height={18} aria-hidden="true"/></button><span className="game-mode">{run.mode === 'random' ? 'Acak' : `${pastDaily ? 'Arsip' : 'Daily'} #${String(run.number).padStart(3, '0')}${pastDaily ? ' · ' + new Intl.DateTimeFormat('id-ID', {day:'numeric',month:'short',timeZone:'Asia/Jakarta'}).format(new Date(`${run.date}T12:00:00+07:00`)) : ''}`}</span></div><span className="total-pill" aria-label={`${num(run.total)} dari 5.000 poin`}><b>{num(run.total)}</b><small> / 5.000</small></span></div>
        <div className="game-heading reveal"><div className="round-title"><h1>{{ bridge2:'Dua kata', bridge3:'Tiga kata', closest:'Dekat makna' }[stage.kind]}</h1><span className="round-count">{active + 1}<span> / 5</span></span></div><div className="stage-progress" role="progressbar" aria-label="Progres babak" aria-valuemin={1} aria-valuemax={5} aria-valuenow={active + 1} aria-valuetext={`Babak ${active + 1} dari 5`}>{Array.from({ length: 5 }, (_, i) => <div key={i} className={`${i === active ? 'current' : ''} ${run.results[i] ? 'done' : ''}`} aria-hidden="true"><span/></div>)}</div></div>
        <div className="game-paper reveal" aria-busy={busy}><ConnectionBoard clues={stage.clues} answer={result ? result.word : undefined} connections={result?.connections} similarities={result?.similarities} result={result} motion={motion}/>{!result ? <form className="answer-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }}><label className="sr-only" htmlFor="answer">SATU KATA VERSIMU</label><div className={`input-wrap ${error ? 'input-error' : ''}`}><input ref={input} id="answer" value={word} onChange={e => changeWord(e.target.value)} placeholder="Ketik satu kata…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} readOnly={busy} aria-describedby={error ? 'answer-error' : 'answer-note'}/><button type="submit" className="primary-button submit-answer" aria-label={busy ? 'Mengirim jawaban' : 'Sambungkan'} title="Kirim jawaban" disabled={!word.trim() || busy}>{busy ? <ReloadIcon width={19} height={19} aria-hidden="true" className="spin"/> : <ArrowRightIcon width={22} height={22} aria-hidden="true"/>}</button></div><div className="input-meta"><span id="answer-note" className="sr-only">Satu kata, satu kesempatan. Maksimal 1.000 poin.</span><kbd className="enter-hint" aria-hidden="true">Enter ↵</kbd><button type="button" className="text-button" disabled={busy} onClick={() => setModal('skip')} aria-label="Lewati babak">Lewati</button></div>{error && <p id="answer-error" className="error-message" role="alert">{error}</p>}</form> : <div className="stage-result" role="region" aria-label="Hasil tebakan" tabIndex={-1}><div className="score-block"><span className="micro">Skor</span><strong><AnimatedScore value={result.score}/><small> / 1.000</small></strong>{result.rank && <p className="rank-note">Peringkat <b>#{num(result.rank)}</b> dari {num(result.vocabularySize!)} kata</p>}</div><div className="best-answer"><span className="micro">Terbaik</span><strong>{result.best} </strong>{run.mode !== 'random' && result.explanation && <p>{result.explanation}</p>}</div><button className="primary-button next-button" data-custom-sound aria-label={run.completed ? 'Lihat hasil akhir' : 'Lanjut ke babak berikutnya'} disabled={busy} onClick={() => void next()}>{run.completed ? 'Hasil' : 'Lanjut'}<ArrowRightIcon width={19} height={19} aria-hidden="true"/></button></div>}</div>
        <p className="game-footnote">{run.demo ? 'MODE DEMO · Skor menggunakan contoh kurasi, belum embedding semantik.' : ''}</p>
      </section>}
      {!openingActivity && page === 'results' && run && <section className="results-page"><div className="result-kicker reveal"> {run.mode === 'random' ? 'MODE ACAK' : `DAILY #${String(run.number).padStart(3, '0')}`} · {dateLabel(run.date)}</div><h1 className="reveal">{run.mode === 'random' ? 'Hasil acak' : 'Hasil daily'}</h1><div className="grand-score reveal"><span className="micro">TOTAL KONEKSIMU</span><strong><AnimatedScore value={run.total}/><small> / 5.000</small></strong><span className="score-underline"/></div>{run.mode === 'daily' && <Comparison runId={run.id}/>}{platform.kind === 'discord' && run.mode === 'daily' && run.completed && <DiscordScores runId={run.id}/>}<div className="results-list reveal">{run.results.map((r, i) => <div className="result-row" key={i}><span className="result-index">0{i + 1}</span><div className="result-words"><span>{r.clues.join(' / ')}</span><strong>{r.word || 'dilewati'}</strong><small>Terbaik: {r.best}</small></div><Chain value={r.score / 1000} variant={i} small/><strong className="row-score">{num(r.score)}</strong></div>)}</div><div className="result-actions reveal"><button className="primary-button" onClick={() => setModal('share')}><Share2Icon width={18} height={18} aria-hidden="true"/>Bagikan hasil</button><button className="secondary-button" onClick={() => void showStats()}><BarChartIcon width={18} height={18} aria-hidden="true"/> Statistikmu</button></div><p className="share-status" data-shared="false">Bagikan skor sebagai gambar, tanpa jawaban.</p>{run.mode === 'random' ? <div className="next-daily random-next"><span role={error ? 'alert' : undefined}>{error ? 'Belum bisa memulai. Coba lagi.' : 'Soal baru, lima babak lagi.'}</span><button className="primary-button" disabled={busy} onClick={() => void begin()}>Main lagi <ArrowRightIcon width={15} height={15} aria-hidden="true"/></button></div> : <div className="next-daily"><ClockIcon width={18} height={18} aria-hidden="true"/><span>{pastDaily ? 'Masih ada Daily lain untuk dimainkan.' : time === '00:00:00' ? 'Daily baru sudah tersedia.' : <>Daily berikutnya dalam <strong>{time}</strong></>}</span><button className="text-button" onClick={() => { if (pastDaily) { setError(''); setModal('archive'); } else { goHome(); void load(); } }}>{pastDaily ? 'Arsip Daily' : 'Beranda'} <ArrowRightIcon width={15} height={15} aria-hidden="true"/></button></div>}{run.demo && <p className="demo-note">Mode demo · hasil ini memakai skor kurasi contoh.</p>}</section>}
    </main>
    <footer className="site-footer"><span>{mode === 'random' ? 'Mode acak · tanpa batas harian' : 'Daily berganti pukul 00.00 WIB'}</span><div>{page === 'home' && mode === 'daily' && daily && <span className="footer-countdown"> KATA BARU DALAM <b>{time}</b></span>}<button className="motion-button sound-button" data-custom-sound aria-label="Suara" aria-pressed={sound.enabled} onClick={sound.toggle}>{sound.enabled ? <SpeakerLoudIcon width={15} height={15} aria-hidden="true"/> : <SpeakerOffIcon width={15} height={15} aria-hidden="true"/>} Suara {sound.enabled ? 'on' : 'off'}</button><button className="motion-button" aria-pressed={motion} onClick={() => setMotion(!motion)}><PlayIcon width={15} height={15} aria-hidden="true"/> Motion {motion ? 'on' : 'off'}<span className={`toggle ${motion ? 'enabled' : ''}`}/></button></div></footer>
    {modal === 'help' && <Modal title="Cara bermain" close={() => setModal(null)}><p className="modal-lead">Lima babak. Cari kata dengan hubungan paling kuat.</p><ol className="help-list"><li><strong>Babak 1-3 / Dua kata</strong><p>Cari satu kata yang cocok dengan dua petunjuk. Misalnya <b>makanan + mall → restoran</b>.</p></li><li><strong>Babak 4 / Tiga kata</strong><p>Satu jawaban untuk tiga petunjuk. Usahakan cocok dengan semuanya.</p></li><li><strong>Babak 5 / Dekat makna</strong><p>Cari kata dengan makna terdekat. Misalnya <b>gembira → senang</b>.</p></li></ol><div className="help-note"><p>Satu tebakan valid per babak. Jawaban alternatif tetap dapat poin. Kata tidak dikenal tidak menghabiskan kesempatan. Lewati berarti nol poin.</p></div><p className="help-small">Daily berganti pukul 00.00 WIB. Mode Acak bisa diulang tanpa mengubah streak atau statistik daily. {platform.kind === 'discord' ? 'Progres tersimpan pada akun Discord kamu. Riwayat browser anonim tetap terpisah.' : 'Progres tersimpan di browser ini melalui cookie anonim. Menghapus cookie atau berpindah perangkat akan membuat identitas baru.'}</p><button className="primary-button full-button" onClick={() => setModal(null)}>Oke, sudah paham <CheckIcon width={18} height={18} aria-hidden="true"/></button></Modal>}
    {modal === 'stats' && <Modal title="Statistik" close={() => setModal(null)}>{stats ? <><div className="stats-grid"><div><strong>{stats.completed}</strong><span>Daily selesai</span></div><div><strong>{stats.streak}</strong><span>Streak hari</span></div><div><strong>{num(stats.best)}</strong><span>Skor terbaik</span></div><div><strong>{num(stats.average)}</strong><span>Rata-rata</span></div></div><p className="help-small">Streak mengikuti tanggal puzzle dalam WIB. Selesaikan daily setiap hari untuk menjaga sambungannya. {platform.kind === 'discord' ? 'Statistik mengikuti akun Discord kamu.' : 'Statistik berlaku untuk identitas anonim di browser ini.'}</p></> : <p role="status">{statsError || 'Memuat statistik…'}</p>}</Modal>}
    {modal === 'share' && run && <Modal title="Bagikan hasil" close={() => setModal(null)}><ShareResult run={run}/></Modal>}
    {modal === 'archive' && <Modal title="Arsip Daily" close={() => setModal(null)}><DailyArchive onPlay={date => void begin('daily',date)} busy={busy} playError={error}/></Modal>}
    {modal === 'skip' && <Modal title="Lewati sambungan ini?" close={() => setModal(null)}><p className="modal-lead">Babak ini mendapat 0 poin dan jawaban terbaik akan dibuka. Kamu tetap bisa lanjut ke babak berikutnya.</p><div className="skip-actions"><button className="secondary-button" onClick={() => setModal(null)}>Pikir lagi</button><button className="primary-button" data-custom-sound onClick={() => void submit(true)}>Ya, lewati <ArrowRightIcon width={18} height={18} aria-hidden="true"/></button></div></Modal>}
  </div>{compactActivity && <ActivityMini run={run} stage={stage} loading={openingActivity && activityStep!=='error'} error={loadError}/>}</>;
}

import gsap from 'gsap';

/** Short phosphor reveals; all transforms are cleared after the screen settles. */
export function enterPage(root: HTMLElement, page: 'home' | 'game' | 'results') {
  root.dataset.sceneState = 'entering';
  return gsap.context(() => {
    const timeline = gsap.timeline({ onComplete:() => { root.dataset.sceneState = 'idle'; } });
    const screen = root.querySelector(page === 'game' ? '.game-paper' : page === 'results' ? '.results-page' : '.daily-lobby');
    if (screen) timeline.fromTo(screen, { opacity:.12, clipPath:'inset(49% 0% 49% 0%)' },
      { opacity:1, clipPath:'inset(0% 0% 0% 0%)', duration:.22, ease:'steps(6)', clearProps:'opacity,clipPath' }, 0);
    if (page === 'game') {
      timeline
        .fromTo('.game-topline, .game-heading', { opacity:0 }, { opacity:1, duration:.16, stagger:.035, ease:'steps(3)', clearProps:'opacity' }, .06)
        .fromTo('.connection-board, .answer-form, .stage-result', { opacity:0 }, { opacity:1, duration:.18, stagger:.035, ease:'steps(3)', clearProps:'opacity' }, .14)
        .fromTo('.clue strong', { opacity:.2 }, { opacity:1, duration:.16, stagger:.035, ease:'steps(2)', clearProps:'opacity' }, .17)
        .fromTo('.stage-progress .current span', { scaleX:.15, transformOrigin:'left center' }, { scaleX:1, duration:.2, clearProps:'transform,transformOrigin', ease:'steps(5)' }, .08);
    } else if (page === 'results') {
      timeline
        .fromTo('.result-kicker, .results-page h1, .grand-score', { opacity:0 }, { opacity:1, duration:.18, stagger:.035, clearProps:'opacity', ease:'steps(3)' }, .15)
        .fromTo('.result-row', { opacity:0 }, { opacity:1, duration:.16, stagger:.04, clearProps:'opacity', ease:'steps(2)' }, .21)
        .fromTo('.result-actions, .next-daily', { opacity:0 }, { opacity:1, duration:.16, stagger:.025, clearProps:'opacity', ease:'steps(2)' }, .35);
      const meters = root.querySelectorAll<SVGRectElement>('.score-meter-clip');
      if (meters.length) timeline.fromTo(meters, { attr:{width:0} }, {
        attr:{width:(_index:number, rect:SVGRectElement) => Number(rect.dataset.strength) * 180},
        duration:.4, stagger:.035, ease:'steps(16)',
      }, .2);
    } else {
      timeline.fromTo('.lobby-play, .lobby-random', { opacity:0 }, { opacity:1, duration:.18, stagger:.045, clearProps:'opacity', ease:'steps(3)' }, .16);
    }
  }, root);
}

/** Animate only a scene change, never socket messages, countdown ticks or drafts. */
export function enterMabar(root: HTMLElement) {
  root.dataset.sceneState = 'entering';
  return gsap.context(() => {
    const timeline = gsap.timeline({ onComplete:() => { root.dataset.sceneState = 'idle'; } });
    const panels = root.querySelectorAll(':scope > .mabar-panel, .mabar-browser > .tab-panel, .mabar-arena');
    timeline.fromTo('.mabar-heading', { opacity:.25 }, { opacity:1, duration:.14, ease:'steps(3)', clearProps:'opacity' }, 0);
    if (panels.length) timeline.fromTo(panels, { opacity:.15, clipPath:'inset(48% 0% 48% 0%)' },
      { opacity:1, clipPath:'inset(0% 0% 0% 0%)', duration:.2, stagger:.025, ease:'steps(5)', clearProps:'opacity,clipPath' }, .03);
  }, root);
}

export function leaveRound(root: HTMLElement): Promise<void> {
  root.dataset.sceneState = 'leaving';
  return new Promise(resolve => {
    gsap.timeline({ onComplete:resolve })
      .to(root.querySelectorAll('.game-heading, .connection-board, .stage-result'), { opacity:.15, duration:.08, ease:'steps(2)' }, 0)
      .fromTo(root.querySelector('.game-paper'), { clipPath:'inset(0% 0% 0% 0%)' }, { clipPath:'inset(49% 0% 49% 0%)', opacity:.25, duration:.12, ease:'steps(5)' }, .02)
      .to(root.querySelector('.game-paper'), { opacity:0, duration:.04, ease:'none' });
  });
}

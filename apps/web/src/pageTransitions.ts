import gsap from 'gsap';

export function enterPage(root: HTMLElement, page: 'home' | 'game' | 'results') {
  root.dataset.sceneState = 'entering';
  return gsap.context(() => {
    const timeline = gsap.timeline({ onComplete:() => { root.dataset.sceneState = 'idle'; } });
    if (page === 'game') {
      timeline
        .fromTo('.game-topline, .game-heading', { opacity:0, y:6 }, { opacity:1, y:0, duration:.22, stagger:.03, clearProps:'opacity,transform', ease:'power2.out' }, 0)
        .fromTo('.game-paper', { opacity:0 }, { opacity:1, duration:.18, clearProps:'opacity' }, .02)
        .fromTo('.connection-board', { opacity:0, y:12 }, { opacity:1, y:0, duration:.3, clearProps:'opacity,transform', ease:'power3.out' }, .04)
        .fromTo('.clue strong', { opacity:0 }, { opacity:1, duration:.24, stagger:.045, clearProps:'opacity' }, .08)
        .fromTo('.answer-form, .stage-result', { opacity:0, y:8 }, { opacity:1, y:0, duration:.24, clearProps:'opacity,transform', ease:'power3.out' }, .14)
        .fromTo('.stage-progress .current span', { scaleX:.2, transformOrigin:'left center' }, { scaleX:1, duration:.3, clearProps:'transform,transformOrigin', ease:'power3.out' }, .05);
    } else if (page === 'results') {
      timeline
        .fromTo('.result-kicker, .results-page h1, .grand-score', { opacity:0, y:10 }, { opacity:1, y:0, duration:.3, stagger:.04, clearProps:'opacity,transform', ease:'power3.out' }, 0)
        .fromTo('.result-row', { opacity:0, y:8 }, { opacity:1, y:0, duration:.28, stagger:.045, clearProps:'opacity,transform', ease:'power3.out' }, .1)
        .fromTo('.result-actions, .next-daily:not(.random-next)', { opacity:0, y:6 }, { opacity:1, y:0, duration:.26, stagger:.035, clearProps:'opacity,transform', ease:'power3.out' }, .3)
        .fromTo('.random-next > button', { opacity:0 }, { opacity:1, duration:.26, clearProps:'opacity', ease:'power2.out' }, .335);
      const meters = root.querySelectorAll<SVGRectElement>('.score-meter-clip');
      if (meters.length) timeline.fromTo(meters, { attr:{width:0} }, {
        attr:{width:(_index:number, rect:SVGRectElement) => Number(rect.dataset.strength) * 180},
        duration:.5, stagger:.045, ease:'power2.out',
      }, .16);
    } else {
      timeline
        .fromTo('.daily-lobby', { opacity:0, y:12 }, { opacity:1, y:0, duration:.32, clearProps:'opacity,transform', ease:'power3.out' }, 0)
        .fromTo('.lobby-play, .lobby-random', { opacity:0 }, { opacity:1, duration:.25, stagger:.06, clearProps:'opacity' }, .1);
    }
  }, root);
}

export function leaveRound(root: HTMLElement): Promise<void> {
  root.dataset.sceneState = 'leaving';
  return new Promise(resolve => {
    gsap.timeline({ onComplete:resolve })
      .to(root.querySelectorAll('.game-heading, .connection-board, .stage-result'), {
        opacity:0, y:-8, duration:.14, stagger:.025, ease:'power2.in',
      }, 0)
      .to(root.querySelector('.game-paper'), { opacity:0, duration:.14, ease:'power2.in' }, .04);
  });
}

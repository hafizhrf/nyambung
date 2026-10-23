import { test, expect, type Page } from '@playwright/test';
async function expectCenteredModal(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return Math.max(Math.abs(box.x + box.width / 2 - innerWidth / 2), Math.abs(box.y + box.height / 2 - innerHeight / 2));
  })).toBeLessThanOrEqual(2);
}

test('plays five stages, resumes, rejects invalid guesses and shares spoiler-free results', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Daily #/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.reveal')).every(el => Number(getComputedStyle(el).opacity) >= .999 && getComputedStyle(el).transform === 'none'));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-home.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Cara bermain' }).click();
  await expectCenteredModal(page);
  await page.getByRole('button', { name: /Oke, sudah/ }).click();
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'SATU KATA VERSIMU' });
  await expect(input).toBeFocused();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.reveal')).every(el => Number(getComputedStyle(el).opacity) >= .999 && getComputedStyle(el).transform === 'none'));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-game.png`, fullPage: true });
  await input.fill('tidakvalidxyz'); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('belum ada');
  await input.fill('nongkrong'); await page.reload();
  await page.getByRole('button', { name: /Lanjutkan bermain/ }).click();
  await expect(input).toHaveValue('nongkrong');
  await input.fill('restoran'); await input.press('Enter');
  await expect(page.getByText('Restoran menyajikan makanan', { exact: false })).toBeVisible();
  await expect(page.locator('.connection-board')).toHaveAttribute('data-reward', 'green');
  await expect(page.locator('.reward-label')).toHaveText('Sambungan sempurna');
  await expect(page.locator('.connection-branches rect')).toHaveCount(0);
  await expect(page.locator('.flow-progress')).toHaveCount(2);
  await expect(page.locator('.flow-progress').first()).toHaveAttribute('d', /C/);
  const other = await context.newPage(); await other.goto('/');
  await other.getByRole('button', { name: /Lanjutkan bermain/ }).click();
  await expect(other.getByText('Restoran menyajikan makanan', { exact: false })).toBeVisible();
  await other.close();
  await page.getByRole('button', { name: /Lanjut ke babak/ }).click();
  for (const word of ['payung', 'kertas', 'biru', 'senang']) {
    await input.fill(word); await input.press('Enter');
    await page.getByRole('button', { name: /Lanjut ke babak|Lihat hasil akhir/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Hasil daily' })).toBeVisible();
  await expect(page.locator('.grand-score')).toContainText('5.000');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.reveal')).every(el => Number(getComputedStyle(el).opacity) >= .999 && getComputedStyle(el).transform === 'none'));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-results.png`, fullPage: true });
  await page.getByRole('button', { name: 'Statistikmu' }).click();
  await expectCenteredModal(page);
  await expect(page.locator('.stats-grid')).toContainText('Daily selesai');
  await expect(page.locator('.stats-grid strong').first()).toHaveText('1');
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as any).__shared = text; } }, configurable: true });
  });
  await page.getByRole('button', { name: /Bagikan hasil/ }).click();
  const text = await page.evaluate(() => (window as any).__shared as string);
  expect(text).toContain('5.000 / 5.000'); expect(text).not.toMatch(/restoran|payung|kertas|biru|senang|makanan|mall/);
  await page.reload(); await page.getByRole('button', { name: 'Lihat hasilmu' }).click();
  await expect(page.getByRole('heading', { name: 'Hasil daily' })).toBeVisible();
});
test('skip requires confirmation and opens the stage result', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Main', exact: true }).click();
  await page.getByRole('button', { name: /Lewati babak/ }).click();
  await expectCenteredModal(page);
  await page.getByRole('button', { name: 'Pikir lagi' }).click();
  await expect(page.getByRole('textbox', { name: 'SATU KATA VERSIMU' })).toBeVisible();
  await page.getByRole('button', { name: /Lewati babak/ }).click();
  await expectCenteredModal(page);
  await page.getByRole('button', { name: /Ya, lewati/ }).click();
  await expect(page.getByText('dilewati', { exact: true })).toBeVisible();
  await expect(page.locator('.score-block strong')).toContainText('0');
  await expect(page.locator('.connection-board')).toHaveAttribute('data-reward', 'none');
});

for (const sample of [
  { score: 951, rank: 30, reward: true },
  { score: 800, rank: 10, reward: true },
  { score: 950, rank: 11, reward: false },
]) {
  test(`chain reward: ${sample.score} points, rank ${sample.rank}`, async ({ page }, testInfo) => {
    await page.route('**/api/runs/*/answers', async route => {
      const response = await route.fetch();
      const run = await response.json();
      Object.assign(run.results[0], { score: sample.score, rank: sample.rank, vocabularySize: 32005 });
      await route.fulfill({ response, json: run });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Main', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'SATU KATA VERSIMU' });
    await input.fill('restoran'); await input.press('Enter');
    await expect(page.locator('.connection-board')).toHaveAttribute('data-reward', sample.reward ? 'blue' : 'none');
    await expect(page.locator('.reward-label:not([aria-hidden="true"])')).toHaveCount(sample.reward ? 1 : 0);
    if (sample.reward) {
      await expect(page.locator('.score-block strong')).toContainText(String(sample.score));
      await expect.poll(() => page.locator('.reward-rays').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(0);
      await page.getByRole('button', { name: /Motion on/ }).click();
      await expect(page.locator('.connection-board')).toHaveAttribute('data-reward', 'blue');
      await expect(page.locator('.reward-label')).toBeVisible();
      await expect(page.locator('.reward-rays')).toHaveCSS('opacity', '0');
      if (sample.rank === 10) {
        await page.screenshot({ path: `test-results/${testInfo.project.name}-reward.png`, fullPage: true });
      }
    }
  });
}

test('guess updates stay in place and sound can be muted persistently', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__audioStarts = [];
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as any).__audioStarts.push({ duration: this.buffer?.duration, rate: this.playbackRate.value });
      return original.apply(this, args);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'SATU KATA VERSIMU' });
  await expect(input).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.reveal')).every(el => Number(getComputedStyle(el).opacity) >= .999 && getComputedStyle(el).transform === 'none'));
  await expect.poll(() => page.evaluate(() => (window as any).__audioStarts.length)).toBeGreaterThan(0);
  await input.fill('restoran');
  await page.evaluate(() => {
    const state = (window as any).__seamless = { board: document.querySelector('.connection-board'), clue: document.querySelector('.clue-grid')!.getBoundingClientRect().toJSON(), faded: false, navigation: performance.getEntriesByType('navigation').length, sampling: true };
    function sample() {
      if (!state.sampling) return;
      for (const selector of ['.game-paper', '.game-heading', '.stage-progress']) {
        if (Number(getComputedStyle(document.querySelector(selector)!).opacity) < .99) state.faded = true;
      }
      requestAnimationFrame(sample);
    }
    sample();
  });
  await input.press('Enter');
  await expect(page.getByRole('region', { name: 'Hasil tebakan' })).toBeVisible();
  await expect(page.locator('.score-block strong')).toContainText('1.000');
  const stability = await page.evaluate(() => {
    const state = (window as any).__seamless;
    state.sampling = false;
    const clue = document.querySelector('.clue-grid')!.getBoundingClientRect();
    return { sameBoard: state.board === document.querySelector('.connection-board'), faded: state.faded, shift: Math.max(Math.abs(clue.x - state.clue.x), Math.abs(clue.y - state.clue.y), Math.abs(clue.height - state.clue.height)), navigations: performance.getEntriesByType('navigation').length - state.navigation };
  });
  expect(stability).toMatchObject({ sameBoard: true, faded: false, navigations: 0 });
  expect(stability.shift).toBeLessThan(1);
  await expect(page.locator('.next-button')).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__audioStarts.some((sound: any) => sound.rate > 1))).toBe(true);
  const soundButton = page.getByRole('button', { name: 'Suara', exact: true });
  await soundButton.click();
  await expect(soundButton).toHaveAttribute('aria-pressed', 'false');
  const starts = await page.evaluate(() => (window as any).__audioStarts.length);
  await page.getByRole('button', { name: /Lanjut ke babak/ }).click();
  await input.fill('tidakvalidxyz'); await input.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__audioStarts.length)).toBe(starts);
  await page.reload();
  await expect(soundButton).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /Lanjutkan bermain/ }).click();
  expect(await page.evaluate(() => (window as any).__audioStarts.length)).toBe(0);
});

async function expectFitsScreen(page: Page, selectors: string[]) {
  await page.waitForFunction(() => Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--app-height')) - innerHeight) < 1 && Math.abs((visualViewport?.height ?? innerHeight) - innerHeight) < 1);
  const fit = () => page.evaluate((selectors) => {
    const bounds = window.visualViewport;
    const width = bounds?.width ?? innerWidth;
    const height = bounds?.height ?? innerHeight;
    const problems = selectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap(el => {
      if (!el.getClientRects().length) return [];
      const box = el.getBoundingClientRect();
      return box.top < -1 || box.left < -1 || box.bottom > height + 1 || box.right > width + 1 ? [`${selector}: ${JSON.stringify(box.toJSON())} in ${width}x${height}`] : [];
    }));
    if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 || scrollY !== 0) problems.push('Document scrolls');
    // Also catch content clipped by the fixed app shell.
    for (const selector of ['main', '.game-paper', '.daily-lobby', '.results-page']) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.scrollHeight > el.clientHeight + 2) problems.push(`${selector} overflows: ${el.scrollHeight}/${el.clientHeight}`);
    }
    return problems;
  }, selectors);
  await expect.poll(fit).toEqual([]);
}

async function expectConnectedLines(page:Page) {
  await expect.poll(()=>page.locator('.connection-board').evaluate(root=>{
    const clues=Array.from(root.querySelectorAll('.clue'));
    const paths=Array.from(root.querySelectorAll<SVGPathElement>('.flow-base'));
    if(paths.length!==clues.length) return Infinity;
    const answer=root.querySelector('.answer-node')!.getBoundingClientRect();
    return Math.max(...paths.map((path,index)=>{
      const matrix=path.getScreenCTM()!;
      const start=path.getPointAtLength(0).matrixTransform(matrix);
      const end=path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      const clue=clues[index].getBoundingClientRect();
      return Math.max(Math.abs(start.x-clue.left-clue.width/2),Math.abs(start.y-clue.bottom),Math.abs(end.x-answer.left-answer.width/2),Math.abs(end.y-answer.top));
    }));
  })).toBeLessThanOrEqual(2);
  await expect(page.locator('.flow-base[stroke-dasharray]')).toHaveCount(0);
  await expect(page.locator('mask')).toHaveCount(0);
  await expect(page.locator('.connection-branches linearGradient')).toHaveAttribute('gradientUnits','userSpaceOnUse');
}

test('home, all five stages and recap fit the viewport', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const sizes = testInfo.project.name === 'desktop'
    ? [{ width:1280,height:720 }, { width:1920,height:1080 }, { width:844,height:390 }]
    : [{ width:390,height:844 }, { width:375,height:667 }, { width:320,height:568 }, { width:390,height:430 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectFitsScreen(page, ['.site-header', '.site-header button', '.site-footer', '.site-footer button', '.daily-lobby', '.lobby-play']);
    await page.screenshot({ path:`test-results/fit-home-${size.width}x${size.height}.png` });
  }
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  for (const word of ['restoran', 'payung', 'kertas', 'biru', 'senang']) {
    const input = page.getByRole('textbox', { name: 'SATU KATA VERSIMU' });
    await expect(input).toBeFocused();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expectFitsScreen(page, ['.site-header', '.site-header button', '.site-footer', '.site-footer button', '.clue', '.answer-node', '.input-wrap', '.input-meta']);
      await expectConnectedLines(page);
      if (word === 'restoran') await page.screenshot({ path:`test-results/fit-game-${size.width}x${size.height}.png` });
    }
    await input.fill(word); await input.press('Enter');
    await expect(page.locator('.next-button')).toBeFocused();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expectFitsScreen(page, ['.clue', '.answer-node', '.score-block', '.best-answer', '.next-button']);
      await expect.poll(()=>page.locator('.game-paper').evaluate(paper=>{
        const next=paper.querySelector('.next-button')!;
        return paper.getBoundingClientRect().bottom-next.getBoundingClientRect().bottom;
      })).toBeGreaterThanOrEqual(10);
      await expectConnectedLines(page);
      if (word === 'biru') await page.screenshot({path:`test-results/connected-three-${size.width}x${size.height}.png`});
    }
    await page.locator('.next-button').click();
  }
  await expect(page.getByRole('heading', { name:'Hasil daily' })).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectFitsScreen(page, ['.site-header', '.site-footer', '.results-list', '.result-actions', '.next-daily']);
    await page.screenshot({ path:`test-results/fit-${size.width}x${size.height}.png` });
  }
});

test('random mode resumes independently and can be played again', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name:'Acak', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Main acak' })).toBeVisible();
  await page.getByRole('button', { name:'Main', exact:true }).click();
  const firstId = await page.evaluate(async () => (await (await fetch('/api/random')).json()).run.id as string);
  await page.getByRole('button', { name:/Lewati babak/ }).click(); await page.getByRole('button', { name:/Ya, lewati/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name:'Acak', exact:true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name:'Lanjutkan bermain' }).click();
  await expect(page.getByText('dilewati', { exact:true })).toBeVisible();
  await expect(page.locator('.best-answer p')).toHaveCount(0);
  // A skipped answer has no filled connection or pulse to animate.
  await expect(page.locator('.flow-pulse')).toHaveCount(0);
  for (let stage = 1; stage < 5; stage++) {
    await page.locator('.next-button').click();
    await expect(page.locator('.flow-pulse').first()).toHaveCSS('animation-name','none');
    await page.getByRole('button', { name:/Lewati babak/ }).click(); await page.getByRole('button', { name:/Ya, lewati/ }).click();
  }
  await page.locator('.next-button').click();
  await expect(page.getByRole('heading', { name:'Hasil acak' })).toBeVisible();
  await expect(page.getByRole('region', { name:'Perbandingan daily' })).toHaveCount(0);
  await expectFitsScreen(page, ['.results-list','.result-actions','.next-daily']);
  await page.getByRole('button', { name:'Main lagi', exact:true }).click();
  const secondId = await page.evaluate(async () => (await (await fetch('/api/random')).json()).run.id as string);
  expect(secondId).not.toBe(firstId);
  await expect(page.getByRole('textbox', { name:'SATU KATA VERSIMU' })).toBeVisible();
  await page.getByRole('button', { name:'Nyambung, beranda' }).click();
  await page.getByRole('button', { name:'Daily', exact:true }).click();
  await page.getByRole('button', { name:'Main', exact:true }).click();
  await expect(page.locator('.clue-grid')).toContainText('makanan');
  const stats = await page.evaluate(async () => (await (await fetch('/api/me/stats')).json()));
  expect(stats.completed).toBe(0); expect(stats.streak).toBe(0);
  await page.screenshot({ path:`test-results/${testInfo.project.name}-mode-switch.png` });
});

test('daily comparison loads real API fields, handles retry and fits small screens', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  let requests = 0;
  await page.route('**/api/runs/*/comparison', route => {
    requests++;
    return route.fulfill({ status:requests === 1 ? 503 : 200, json:requests === 1 ? { error:'Indisponible' } : { players:3, average:3333, best:5000, rank:2, abovePercent:50, histogram:[0,0,0,0,1,0,1,0,0,1], ownScore:3000 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name:'Main', exact:true }).click();
  await page.evaluate(async () => {
    const run = await (await fetch('/api/daily')).json();
    for (let stage = 0; stage < 5; stage++) await fetch(`/api/runs/${run.run.id}/answers`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ stage, skip:true }) });
  });
  await page.reload(); await page.getByRole('button', { name:'Lihat hasilmu' }).click();
  const comparison = page.getByRole('region', { name:'Perbandingan daily' });
  await comparison.getByRole('button', { name:'Coba lagi' }).click();
  await expect(comparison.getByRole('img')).toBeVisible(); await expect(comparison.locator('.histogram-bin.is-you')).toHaveCount(1); await expect(comparison).toContainText('3.333'); await expect(comparison).toContainText('#2'); await expect(comparison).toContainText('50%');
  const sizes = testInfo.project.name === 'desktop' ? [{width:1280,height:720},{width:844,height:390}] : [{width:375,height:667},{width:320,height:568},{width:390,height:430}];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectFitsScreen(page, ['.daily-comparison','.results-list','.result-actions','.next-daily']);
    await page.screenshot({ path:`test-results/comparison-${size.width}x${size.height}.png` });
  }
});

for(const score of [600,990]) {
  test(`each branch fills to its own connection strength at score ${score}`,async({page},testInfo)=>{
    await page.route('**/api/runs/*/answers',async route=>{
      const response=await route.fetch(),run=await response.json();
      if(run.results[3]) Object.assign(run.results[3],{connections:[.2,.95,.4],similarities:[.08,.35,.12],score,rank:score===990?5:200});
      await route.fulfill({response,json:run});
    });
    await page.goto('/');await page.getByRole('button',{name:'Main',exact:true}).click();
    for(let stage=0;stage<3;stage++) {
      await page.getByRole('button',{name:/Lewati babak/}).click();
      await page.getByRole('button',{name:/Ya, lewati/}).click();
      await page.locator('.next-button').click();
    }
    const input=page.getByRole('textbox',{name:'SATU KATA VERSIMU'});
    await input.fill('biru');await input.press('Enter');
    await expect(page.locator('.flow-progress')).toHaveCount(3);
    for(const [i,value] of [.2,.95,.4].entries()) {
      const branch=page.locator(`[data-connection="${i}"]`);
      await expect(branch.locator('.flow-progress')).toHaveAttribute('stroke-dasharray',`${value} 1`);
      await expect(branch.locator('.flow-progress')).toHaveCount(1);
      await expect(branch.locator('g[mask]')).toHaveCount(0);
      await expect(branch.locator('.flow-base')).toHaveAttribute('stroke','#d8e5f9');
      await expect(page.locator('.clue-strength').nth(i)).toHaveText(`${Math.round(value*100)}% terhubung`);
    }
    await expect(page.locator('.connection-board')).toHaveAttribute('data-reward',score===990?'blue':'none');
    await expectConnectedLines(page);
    await page.screenshot({path:`test-results/${testInfo.project.name}-connection-strength-${score}.png`});
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(page.locator('.flow-progress').nth(1)).toHaveAttribute('stroke-dasharray','0.95 1');
  });
}

test('perfect answer shakes the cards briefly and respects reduced motion', async ({page},testInfo)=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Main',exact:true}).click();
 await page.evaluate(()=>{
  const state={moved:false};(window as any).cardMotion=state;
  const observer=new MutationObserver(()=>{
   document.querySelectorAll('.clue').forEach(el=>{
    const transform=getComputedStyle(el).transform;
    if(transform!=='none'&&Math.abs(new DOMMatrixReadOnly(transform).m41)>.5) state.moved=true;
   });
  });
  observer.observe(document.querySelector('.connection-board')!,{attributes:true,subtree:true,attributeFilter:['style']});
 });
 const input=page.getByRole('textbox',{name:'SATU KATA VERSIMU'});
 await input.fill('restoran');await input.press('Enter');
 await expect(page.locator('.score-block strong')).toContainText('1.000');
 if(testInfo.project.name==='desktop') await expect.poll(()=>page.evaluate(()=>(window as any).cardMotion.moved)).toBe(true);
 else expect(await page.evaluate(()=>(window as any).cardMotion.moved)).toBe(false);
 await expect.poll(()=>page.locator('.clue').first().evaluate(el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41))).toBe(0);
 await expect(page.locator('.connection-board')).toHaveAttribute('data-reward','green');
 await expect(page.locator('.answer-node strong')).toHaveCSS('color','rgb(21, 128, 61)');
 await expect(page.locator('.clue').first()).toHaveCSS('background-color','rgb(240, 253, 244)');
 await expect(page.locator('.score-block strong')).toHaveCSS('color','rgb(21, 128, 61)');
 await expect(page.locator('.next-button')).toHaveCSS('background-color','rgb(21, 128, 61)');
 await page.screenshot({path:`test-results/${testInfo.project.name}-perfect-green.png`});
 if(testInfo.project.name==='desktop') {
  const next=page.locator('.next-button');
  await next.hover();await page.mouse.down();
  await expect.poll(()=>next.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBeLessThan(.99);
  await page.mouse.up();
 }

});

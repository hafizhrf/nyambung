import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
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
  const reducedMotion=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  for(const pulse of await page.locator('.flow-pulse').all()) {
    if(reducedMotion) await expect(pulse).toHaveCSS('animation-name','none');
    else await expect(pulse).toHaveCSS('animation-timing-function',/^steps\(/);
  }
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
  await expect(page.locator('.flow-progress').first()).toHaveAttribute('d', /V.*H.*V/);
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
  const resultMeters = await page.locator('.score-meter-track').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
  expect(resultMeters).toHaveLength(5);
  await expect(page.locator('.score-meter-progress')).toHaveCount(5);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.reveal')).every(el => Number(getComputedStyle(el).opacity) >= .999 && getComputedStyle(el).transform === 'none'));
  await page.screenshot({ path: `test-results/${testInfo.project.name}-results.png`, fullPage: true });
  await page.getByRole('button', { name: 'Statistikmu' }).click();
  await expectCenteredModal(page);
  await expect(page.locator('.stats-grid')).toContainText('Daily selesai');
  await expect(page.locator('.stats-grid strong').first()).toHaveText('1');
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    (window as any).__cardText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof original>) {
      (window as any).__cardText.push(args[0]);
      return original.apply(this,args);
    };
  });
  await page.getByRole('button', { name: /Bagikan hasil/ }).click();
  await expect(page.getByRole('img', { name:/Kartu skor Nyambung/ })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name:'Unduh gambar', exact:true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^nyambung-daily-.*\.png$/);
  const imagePath = `test-results/${testInfo.project.name}-share-card.png`;
  await download.saveAs(imagePath);
  const png = await readFile(imagePath);
  expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1080); expect(png.readUInt32BE(20)).toBe(1350);
  const text = await page.evaluate(() => (window as any).__cardText.join(' ') as string);
  expect(text).toContain('5.000'); expect(text).not.toMatch(/restoran|payung|kertas|biru|senang|makanan|mall/);
  const fallbackDownload = page.waitForEvent('download');
  await page.getByRole('button', { name:'Bagikan gambar', exact:true }).click();
  expect((await fallbackDownload).suggestedFilename()).toMatch(/\.png$/);
  await page.evaluate(() => {
    Object.defineProperty(navigator,'canShare',{configurable:true,value:(data:ShareData)=>data.files?.[0]?.type==='image/png'});
    Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{
      (window as any).__sharedImage = {count:data.files?.length,type:data.files?.[0]?.type,size:data.files?.[0]?.size,text:data.text,url:data.url};
    }});
  });
  await page.getByRole('button', { name:'Bagikan gambar', exact:true }).click();
  expect(await page.evaluate(() => (window as any).__sharedImage)).toMatchObject({count:1,type:'image/png',text:undefined,url:undefined});
  await page.getByRole('button', { name:'Tutup', exact:true }).click();
  await page.reload(); await page.getByRole('button', { name: 'Lihat hasilmu' }).click();
  await expect(page.getByRole('heading', { name: 'Hasil daily' })).toBeVisible();
  expect(await page.locator('.score-meter-track').evaluateAll(paths => paths.map(path => path.getAttribute('d')))).toEqual(resultMeters);
});

test('result pixel meters fill only in proportion to a non-perfect score', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');await page.getByRole('button',{name:'Main',exact:true}).click();
  const input=page.getByRole('textbox',{name:'SATU KATA VERSIMU'});
  await input.fill('nongkrong');await input.press('Enter');
  for(let stage=1;stage<5;stage++) {
    await page.locator('.next-button').click();
    await page.getByRole('button',{name:/Lewati babak/}).click();
    await page.getByRole('button',{name:/Ya, lewati/}).click();
  }
  await page.locator('.next-button').click();
  const run=await page.evaluate(async()=>(await(await fetch('/api/daily')).json()).run);
  expect(run.results[0].score).toBeGreaterThan(0);expect(run.results[0].score).toBeLessThan(1000);
  const clips=await page.locator('.score-meter-clip').evaluateAll(rects=>rects.map(rect=>Number(rect.getAttribute('width'))));
  expect(clips[0]).toBeCloseTo(180*run.results[0].score/1000,3);
  expect(clips[0]).toBeLessThan(180);expect(clips.slice(1)).toEqual([0,0,0,0]);
  await expect(page.locator('.score-meter-progress')).toHaveCount(1);
  await page.screenshot({path:'test-results/partial-score-meters.png'});
});

test('Continue animates out and into the next round without double navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name:'Main', exact:true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-scene-state','idle');
  await page.getByRole('button', { name:/Lewati babak/ }).click();
  await page.getByRole('button', { name:/Ya, lewati/ }).click();
  await expect(page.locator('.next-button')).toBeFocused();
  await page.evaluate(() => {
    (window as any).__sceneStates = [];
    const main = document.querySelector('main')!;
    new MutationObserver(() => (window as any).__sceneStates.push(main.dataset.sceneState)).observe(main, {attributes:true,attributeFilter:['data-scene-state']});
  });
  await page.locator('.next-button').evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('textbox', { name:'SATU KATA VERSIMU' })).toBeFocused();
  await expect(page.getByRole('progressbar', { name:'Progres babak' })).toHaveAttribute('aria-valuenow','2');
  await expect(page.locator('main')).toHaveAttribute('data-scene-state','idle');
  const states = await page.evaluate(() => (window as any).__sceneStates as string[]);
  expect(states).toContain('leaving'); expect(states).toContain('entering'); expect(states.at(-1)).toBe('idle');
  expect(await page.evaluate(async () => (await (await fetch('/api/daily')).json()).run.results.length)).toBe(1);
});

test('Continue changes rounds directly with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name:'Main', exact:true }).click();
  await page.getByRole('button', { name:/Lewati babak/ }).click();
  await page.getByRole('button', { name:/Ya, lewati/ }).click();
  await page.locator('.next-button').click();
  await expect(page.getByRole('textbox', { name:'SATU KATA VERSIMU' })).toBeFocused();
  await expect(page.locator('main')).toHaveAttribute('data-scene-state','idle');
  await expect(page.locator('.connection-board')).toHaveCSS('transform','none');
});
test('past Daily starts from the archive, resumes and completes without changing today', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  const archive = await page.evaluate(async () => await (await fetch('/api/archive')).json());
  const entry = archive.entries[0];
  expect(entry.date < archive.today).toBe(true);
  await page.getByRole('button', { name:'Arsip Daily', exact:true }).click();
  await expectCenteredModal(page);
  const label = new RegExp(`Daily #${String(entry.number).padStart(3,'0')}`);
  const opening = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('dialog').getByRole('button', { name:label }).click();
  const run = await (await opening).json();
  expect(run.date).toBe(entry.date);
  await expect(page.locator('.game-mode')).toContainText('Arsip');
  await page.getByRole('button', { name:/Lewati babak/ }).click();
  await page.getByRole('button', { name:/Ya, lewati/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name:/Daily #/ })).toBeVisible();
  expect(await page.evaluate(async () => (await (await fetch('/api/daily')).json()).run)).toBeNull();
  await page.getByRole('button', { name:'Arsip Daily', exact:true }).click();
  const continuing = page.waitForResponse(response => response.url().endsWith('/api/runs') && response.request().method() === 'POST');
  await page.getByRole('dialog').getByRole('button', { name:label }).filter({ hasText:'Lanjutkan' }).click();
  expect((await (await continuing).json()).id).toBe(run.id);
  await expect(page.getByText('dilewati', { exact:true })).toBeVisible();
  for(let stage=1;stage<5;stage++) {
    await page.locator('.next-button').click();
    await page.getByRole('button', { name:/Lewati babak/ }).click();
    await page.getByRole('button', { name:/Ya, lewati/ }).click();
  }
  await page.locator('.next-button').click();
  await expect(page.getByRole('heading', { name:'Hasil daily' })).toBeVisible();
  expect(await page.evaluate(async () => (await (await fetch('/api/daily')).json()).run)).toBeNull();
  await page.getByRole('button', { name:'Arsip Daily', exact:true }).click();
  await page.getByRole('dialog').getByRole('button', { name:label }).filter({ hasText:'Lihat hasil' }).click();
  await expect(page.getByRole('heading', { name:'Hasil daily' })).toBeVisible();
  await page.getByRole('button', { name:'Nyambung, beranda' }).click();
  await page.getByRole('button', { name:'Main', exact:true }).click();
  await expect(page.locator('.game-mode')).toContainText('Daily #');
});

test('the answer form follows the board without a stretched empty space', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name:'Main', exact:true }).click();
  const input = page.getByRole('textbox', { name:'SATU KATA VERSIMU' });
  await expect(input).toHaveValue('');
  await expect.poll(()=>page.locator('.game-paper').evaluate(paper=>{
    const board=paper.querySelector('.connection-board')!.getBoundingClientRect();
    const form=paper.querySelector('.answer-form')!.getBoundingClientRect();
    return form.top-board.bottom;
  })).toBeLessThanOrEqual(16);
  await expect.poll(() => page.locator('.game-paper').evaluate(paper => {
    const form = paper.querySelector('.answer-form')!;
    const style = getComputedStyle(paper);
    return Math.abs(paper.getBoundingClientRect().bottom - form.getBoundingClientRect().bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth));
  })).toBeLessThanOrEqual(1);
});

test('a submitted answer morphs into Continue before score details appear', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name:'Main', exact:true }).click();
  const input = page.getByRole('textbox', { name:'SATU KATA VERSIMU' });
  await input.fill('restoran');
  await page.evaluate(() => {
    const state = (window as any).__answerMorph = { widths:[document.querySelector('.input-wrap')!.getBoundingClientRect().width], overlap:false, running:true };
    function sample() {
      if (!state.running) return;
      const field = document.querySelector<HTMLElement>('.input-wrap[data-morphing="true"]');
      if (field) {
        state.widths.push(field.getBoundingClientRect().width);
        if (document.querySelector('.score-block')) state.overlap = true;
      }
      requestAnimationFrame(sample);
    }
    sample();
  });
  await input.press('Enter');
  await expect(page.locator('.score-block strong')).toContainText('1.000');
  await expect(page.locator('.best-answer')).toHaveCSS('opacity','1');
  await expect(page.locator('.next-button')).toBeFocused();
  const state = await page.evaluate(() => {
    const state = (window as any).__answerMorph;
    state.running = false;
    return { samples:state.widths.length, largest:Math.max(...state.widths), smallest:Math.min(...state.widths), overlap:state.overlap };
  });
  expect(state.samples).toBeGreaterThan(2);
  expect(state.smallest).toBeLessThan(state.largest * .8);
  expect(state.overlap).toBe(false);
  await expect(page.locator('.answer-morph-label')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
});

test('reduced motion reveals the answer without a field morph', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name:'Main', exact:true }).click();
  await expect(page.locator('.game-paper')).toBeVisible();
  await page.evaluate(() => {
    (window as any).__morphSeen = false;
    new MutationObserver(records => {
      if (records.some(record => Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches('.answer-morph-label') || node.querySelector('.answer-morph-label'))))) (window as any).__morphSeen = true;
    }).observe(document.querySelector('.game-paper')!, {childList:true,subtree:true});
  });
  const input = page.getByRole('textbox', { name:'SATU KATA VERSIMU' });
  await input.fill('restoran'); await input.press('Enter');
  await expect(page.locator('.score-block strong')).toContainText('1.000');
  await expect(page.locator('.next-button')).toBeFocused();
  expect(await page.evaluate(() => (window as any).__morphSeen)).toBe(false);
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
      await page.getByRole('button', { name: 'Pengaturan' }).click();
      await page.getByRole('button', { name: /Motion on/ }).click();
      await page.getByRole('button', { name: 'Tutup', exact:true }).click();
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
  await page.getByRole('button', { name:'Pengaturan' }).click();
  const soundButton = page.getByRole('button', { name: 'Suara', exact: true });
  await soundButton.click();
  await expect(soundButton).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name:'Tutup', exact:true }).click();
  const starts = await page.evaluate(() => (window as any).__audioStarts.length);
  await page.getByRole('button', { name: /Lanjut ke babak/ }).click();
  await input.fill('tidakvalidxyz'); await input.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__audioStarts.length)).toBe(starts);
  await page.reload();
  await page.getByRole('button', { name:'Pengaturan' }).click();
  await expect(soundButton).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name:'Tutup', exact:true }).click();
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
      const main=document.querySelector('main')!;
      const scrollableRecap=!!el.closest('.results-page')&&main.scrollHeight>main.clientHeight+2&&getComputedStyle(main).overflowY==='auto';
      return (!scrollableRecap&&(box.top < -1||box.bottom > height+1))||box.left < -1||box.right > width+1 ? [`${selector}: ${JSON.stringify(box.toJSON())} in ${width}x${height}`] : [];
    }));
    if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 || scrollY !== 0) problems.push('Document scrolls');
    // Also catch content clipped by the fixed app shell.
    for (const selector of ['main', '.game-paper', '.daily-lobby', '.results-page', '.results-list', '.row-score']) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.scrollHeight > el.clientHeight + 2 && !(selector==='main'&&el.querySelector('.results-page')&&getComputedStyle(el).overflowY==='auto')) problems.push(`${selector} overflows: ${el.scrollHeight}/${el.clientHeight}`);
      if (el && ['.results-list','.row-score'].includes(selector) && el.scrollWidth > el.clientWidth + 2) problems.push(`${selector} overflows horizontally: ${el.scrollWidth}/${el.clientWidth}`);
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
      return Math.max(Math.abs(start.x-clue.left-clue.width/2),Math.abs(start.y-clue.bottom),Math.abs(end.x-answer.left-answer.width*(clues.length===1?.5:clues.length===2?(index+1)/3:.2+index*.3)),Math.abs(end.y-answer.top));
    }));
  })).toBeLessThanOrEqual(2);
  for(const path of await page.locator('.flow-base').all()) await expect(path).toHaveAttribute('stroke-dasharray','.375 .625');
  await expect(page.locator('.connection-branches svg')).toHaveAttribute('shape-rendering','crispEdges');
  await expect(page.locator('.connection-branches linearGradient')).toHaveAttribute('gradientUnits','userSpaceOnUse');
}

test('home, all five stages and recap fit the viewport', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.route('**/api/runs/*/answers',async route=>{
    const response=await route.fetch(),run=await response.json();
    for(const result of run.results)if(result.rank)result.vocabularySize=85306;
    await route.fulfill({response,json:run});
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const sizes = testInfo.project.name === 'desktop'
    ? [{ width:1280,height:720 }, { width:1920,height:1080 }, { width:844,height:390 }]
    : [{ width:390,height:844 }, { width:375,height:667 }, { width:320,height:568 }, { width:390,height:430 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectFitsScreen(page, ['.site-header', '.site-header button', '.daily-lobby', '.lobby-play', '.lobby-random']);
    await page.screenshot({ path:`test-results/fit-home-${size.width}x${size.height}.png` });
  }
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  for (const word of ['restoran', 'payung', 'kertas', 'biru', 'senang']) {
    const input = page.getByRole('textbox', { name: 'SATU KATA VERSIMU' });
    await expect(input).toBeFocused();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expectFitsScreen(page, ['.site-header', '.site-header button', '.clue', '.answer-node', '.input-wrap', '.input-meta']);
      await expectConnectedLines(page);
      if (word === 'restoran') await page.screenshot({ path:`test-results/fit-game-${size.width}x${size.height}.png` });
    }
    await input.fill(word); await input.press('Enter');
    await expect(page.locator('.next-button')).toBeFocused();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expectFitsScreen(page, ['.clue', '.answer-node', '.score-block', '.best-answer', '.next-button']);
      await expect.poll(()=>page.locator('.score-block strong').evaluate(el=>{
        const value=el.querySelector('span')!,denominator=el.querySelector('small')!;
        return value.scrollWidth<=value.clientWidth+1&&denominator.scrollWidth<=denominator.clientWidth+1&&denominator.getBoundingClientRect().height<=parseFloat(getComputedStyle(denominator).lineHeight)+1;
      })).toBe(true);
      await expect.poll(()=>page.locator('.game-paper').evaluate(paper=>{
        const next=paper.querySelector('.next-button')!;
        return paper.getBoundingClientRect().bottom-next.getBoundingClientRect().bottom;
      })).toBeGreaterThanOrEqual(10);
      await expectConnectedLines(page);
      if(size.height>520)await expect.poll(()=>page.locator('.game-paper').evaluate(paper=>{
        const board=paper.querySelector('.connection-board')!.getBoundingClientRect();
        const result=paper.querySelector('.stage-result')!.getBoundingClientRect();
        return result.top-board.bottom;
      })).toBeLessThanOrEqual(16);
      if (word === 'biru') await page.screenshot({path:`test-results/connected-three-${size.width}x${size.height}.png`});
    }
    await page.locator('.next-button').click();
  }
  await expect(page.getByRole('heading', { name:'Hasil daily' })).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.locator('main').evaluate(el=>{el.scrollTop=0;});
    await expectFitsScreen(page, ['.site-header']);
    await expect.poll(()=>page.locator('.results-page h1').evaluate(title=>title.getBoundingClientRect().top-document.querySelector('.site-header')!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(12);
    for(const selector of ['.result-row','.result-actions button','.next-daily button']){
      for(const element of await page.locator(selector).all()){
        await element.scrollIntoViewIfNeeded();
        await expect(element).toBeInViewport({ratio:.95});
      }
    }
    await page.locator('main').evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({ path:`test-results/fit-${size.width}x${size.height}.png` });
  }
});

for (const keyboardMode of ['visual viewport', 'layout viewport']) {
  test(`mobile keyboard dismisses the navbar smoothly and fits the card (${keyboardMode})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Main', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'SATU KATA VERSIMU' });
    await expect(input).toBeFocused();
    expect(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    const header = await page.locator('.site-header').boundingBox();
    const fullViewport = await page.evaluate(() => ({ height: visualViewport!.height, offsetTop: visualViewport!.offsetTop, layoutHeight: innerHeight }));
    for (const height of [480, 430, 340]) {
      await page.evaluate(({ height, resizeLayout }) => {
        const viewport = window.visualViewport!;
        Object.defineProperty(viewport, 'height', { configurable: true, value: height });
        Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 12 });
        if (resizeLayout) Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
        viewport.dispatchEvent(new Event('resize'));
      }, { height, resizeLayout: keyboardMode === 'layout viewport' });
      await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'open');
      await expect.poll(async () => page.locator('.site-header').evaluate(el => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.opacity === '0' || rect.bottom <= 1;
      })).toBe(true);
      await expect.poll(() => page.locator('.game-paper').evaluate(paper => {
        const clue = paper.querySelector('.clue')!;
        const style = getComputedStyle(paper);
        return Math.abs(clue.getBoundingClientRect().top - paper.getBoundingClientRect().top - parseFloat(style.paddingTop) - parseFloat(style.borderTopWidth));
      })).toBeLessThanOrEqual(5);
      await expect.poll(() => page.evaluate(() => {
        const answer = document.querySelector('.answer-node')!.getBoundingClientRect();
        const field = document.querySelector('.input-wrap')!.getBoundingClientRect();
        return field.top - answer.bottom;
      })).toBeLessThanOrEqual(40);
      for (const selector of ['.clue', '.answer-node', '.input-wrap', '.input-meta']) {
        for (const element of await page.locator(selector).all()) {
          const box = await element.boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height).toBeLessThanOrEqual(height + 25);
        }
      }
    }
    // Extremely short keyboard view: scroll only the card to keep editing controls visible.
    await page.evaluate(()=>{
      Object.defineProperty(visualViewport!,'height',{configurable:true,value:240});
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    await expect.poll(()=>page.locator('.input-wrap').evaluate(el=>{
      const box=el.getBoundingClientRect();return box.top>=12&&box.bottom<=252&&scrollY===0;
    })).toBe(true);
    await page.evaluate(()=>{
      Object.defineProperty(visualViewport!,'height',{configurable:true,value:340});
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    // On real phones focus can move before the keyboard's closing resize completes.
    await input.fill('restoran');await input.press('Enter');
    await expect(page.locator('.next-button')).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-keyboard','open');
    for(const selector of ['.clue','.answer-node','.stage-result','.next-button']){
      for(const element of await page.locator(selector).all()){
        const box=await element.boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(12);
        expect(box!.y+box!.height).toBeLessThanOrEqual(352);
      }
    }
    await page.evaluate(({ height, offsetTop, layoutHeight }) => {
      const viewport = window.visualViewport!;
      Object.defineProperty(viewport, 'height', { configurable: true, value: height });
      Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: offsetTop });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: layoutHeight });
      viewport.dispatchEvent(new Event('resize'));
    }, fullViewport);
    await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'closed');
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.locator('.site-header')).toHaveCSS('height', `${header!.height}px`);
    await page.locator('.next-button').click();
    await expect(input).toBeFocused();
  });
}

test('random mode resumes independently and can be played again', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.addInitScript(() => localStorage.setItem('nyambung-mode', 'random'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name:/Daily #/ })).toBeVisible();
  await expect(page.getByRole('group', { name:'Mode permainan' })).toHaveCount(0);
  const dailyButton = page.getByRole('button', { name:'Main', exact:true });
  const randomButton = page.getByRole('button', { name:'Random Play', exact:true });
  const dailyBox = await dailyButton.boundingBox(), randomBox = await randomButton.boundingBox();
  expect(randomBox!.y).toBeGreaterThan(dailyBox!.y + dailyBox!.height);
  expect(await randomButton.evaluate(el => getComputedStyle(el).color)).not.toBe(await dailyButton.evaluate(el => getComputedStyle(el).color));
  await randomButton.click();
  const firstId = await page.evaluate(async () => (await (await fetch('/api/random')).json()).run.id as string);
  await page.getByRole('button', { name:/Lewati babak/ }).click(); await page.getByRole('button', { name:/Ya, lewati/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name:/Daily #/ })).toBeVisible();
  await page.getByRole('button', { name:'Lanjutkan Random Play', exact:true }).click();
  expect(await page.evaluate(async () => (await (await fetch('/api/random')).json()).run.id)).toBe(firstId);
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
  await expect(page.locator('.random-next')).not.toContainText('Acak');
  const replay=await page.getByRole('button',{name:'Main lagi',exact:true}).boundingBox();
  const recap=await page.locator('.results-page').boundingBox();
  expect(Math.abs(replay!.x+replay!.width/2-recap!.x-recap!.width/2)).toBeLessThan(2);
  // A fading/disabled button must reveal a gap, rather than a line through its label.
  const crt=page.getByRole('button',{name:'Efek CRT',exact:true});
  await crt.click();
  const replayButton=page.getByRole('button',{name:'Main lagi',exact:true});
  await replayButton.evaluate(el=>(el as HTMLElement).style.opacity='0');
  const footer=(await page.locator('.random-next').boundingBox())!;
  const shot=await page.screenshot({scale:'css'});
  const pixels=await sharp(shot).extract({left:Math.round(replay!.x)+6,top:Math.round(footer.y+footer.height/2),width:Math.floor(replay!.width)-12,height:2}).removeAlpha().raw().toBuffer();
  expect(Math.max(...Array.from(pixels).filter((_,index)=>index%3===0))).toBeLessThan(40);
  await replayButton.evaluate(el=>(el as HTMLElement).style.opacity='');
  await crt.click();
  await page.getByRole('button', { name:'Main lagi', exact:true }).click();
  const secondId = await page.evaluate(async () => (await (await fetch('/api/random')).json()).run.id as string);
  expect(secondId).not.toBe(firstId);
  await expect(page.getByRole('textbox', { name:'SATU KATA VERSIMU' })).toBeVisible();
  await page.getByRole('button', { name:'Nyambung, beranda' }).click();
  await expect(page.getByRole('heading', { name:/Daily #/ })).toBeVisible();
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
  await expect(comparison.locator('.comparison-summary')).toHaveCount(3); await expect(comparison).toContainText('3.333'); await expect(comparison).toContainText('#2'); await expect(comparison).toContainText('50%');
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
      await expect(branch.locator('.flow-fill')).toHaveAttribute('stroke-dasharray',`${value} 1`);
      await expect(branch.locator('.flow-progress')).toHaveCount(1);
      await expect(branch.locator('.flow-progress')).toHaveAttribute('stroke-dasharray','.375 .625');
      await expect(branch.locator('g[mask]')).toHaveCount(0);
      await expect(branch.locator('.flow-base')).toHaveAttribute('stroke','#35304d');
      await expect(page.locator('.clue-strength').nth(i)).toHaveText(`${Math.round(value*100)}% terhubung`);
    }
    await expect(page.locator('.connection-board')).toHaveAttribute('data-reward',score===990?'blue':'none');
    await expectConnectedLines(page);
    await page.screenshot({path:`test-results/${testInfo.project.name}-connection-strength-${score}.png`});
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(page.locator('.flow-fill').nth(1)).toHaveAttribute('stroke-dasharray','0.95 1');
  });
}

test('perfect answer shakes the cards briefly and respects reduced motion', async ({page},testInfo)=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Main',exact:true}).click();
 await expect(page.locator('.game-paper')).toBeVisible();
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
 await expect(page.locator('.answer-node strong')).toHaveCSS('color','rgb(142, 224, 122)');
 await expect(page.locator('.clue').first()).toHaveCSS('background-color','rgb(21, 33, 23)');
 await expect(page.locator('.score-block strong')).toHaveCSS('color','rgb(142, 224, 122)');
 await page.mouse.move(0,0);
 await expect(page.locator('.next-button')).toHaveCSS('background-color','rgb(142, 224, 122)');
 await page.screenshot({path:`test-results/${testInfo.project.name}-perfect-green.png`});
 if(testInfo.project.name==='desktop') {
  const next=page.locator('.next-button');
  await next.hover();await page.mouse.down();
  await expect.poll(()=>next.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).a)).toBeLessThan(.99);
  await page.mouse.up();
 }

});

test('long clues and answers stay intact across screen sizes',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/api/runs/*/answers',async route=>{
    const response=await route.fetch(),run=await response.json();
    if(run.current?.index===3)run.current.clues=['merah','penghalang','senam'];
    if(run.results[3])run.results[3].word='pertanggungjawaban';
    await route.fulfill({response,json:run});
  });
  await page.goto('/');await page.getByRole('button',{name:'Main',exact:true}).click();
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Lewati babak',exact:true}).click();
    await page.getByRole('button',{name:/Ya, lewati/}).click();
    await page.locator('.next-button').click();
  }
  await expect(page.locator('.clue strong').nth(1)).toHaveText('penghalang');
  await expect(page.locator('.clue .micro,.answer-node .micro,.arcade-frame-title')).toHaveCount(0);
  const sizes=[[1280,720],[390,844],[320,568],[390,430],[844,390]];
  const fits=()=>page.locator('.connection-board .fit-word').evaluateAll(words=>words.every(word=>{
    const style=getComputedStyle(word);
    return word.scrollWidth<=word.clientWidth+1&&word.getBoundingClientRect().height<=parseFloat(style.lineHeight)+1&&parseFloat(style.fontSize)>=9;
  }));
  for(const [width,height] of sizes){await page.setViewportSize({width,height});await expect.poll(fits).toBe(true);}
  await page.getByRole('textbox').fill('biru');await page.getByRole('textbox').press('Enter');
  await expect(page.locator('.answer-node strong')).toHaveText('pertanggungjawaban');
  for(const [width,height] of sizes){await page.setViewportSize({width,height});await expect.poll(fits).toBe(true);}
});

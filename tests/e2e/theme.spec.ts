import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('arcade theme ignores old light preferences and CRT persists across game and dialogs',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('nyambung-theme:browser','light');
    localStorage.setItem('nyambung-theme:discord','light');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','arcade');
  const crt=page.getByRole('button',{name:'Efek CRT',exact:true});
  await expect(crt).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.crt-screen')).toHaveCSS('filter',/crt-barrel/);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el,'::after').pointerEvents)).toBe('none');
  // One screen filter includes the header; inner panels are not filtered twice.
  await expect(page.locator('main')).toHaveCSS('filter','none');
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.fonts.check('24px "Arcade Pixel"'))).toBe(true);
  expect(await page.locator('body *').evaluateAll(nodes=>nodes.filter(el=>el.textContent?.trim()&&el.getClientRects().length).every(el=>getComputedStyle(el).fontStyle==='normal'))).toBe(true);
  await expect(page.locator('.site-footer,.lobby-example,.lobby-rules')).toHaveCount(0);
  await crt.click();
  await expect(page.locator('html')).toHaveAttribute('data-crt','off');
  await expect(page.locator('.crt-screen')).toHaveCSS('filter','none');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#08090d');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','arcade');
  await expect(crt).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Cara bermain'}).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color','rgb(16, 16, 23)');
  await page.screenshot({path:'test-results/arcade-help.png'});
  await page.getByRole('button',{name:'Tutup',exact:true}).click();
  await page.getByRole('button',{name:'Main',exact:true}).click();
  await expect(page.locator('.game-paper')).toHaveCSS('background-color','rgb(16, 16, 23)');
  await expect(page.getByRole('textbox')).toHaveCSS('color','rgb(240, 233, 203)');
  await page.screenshot({path:'test-results/arcade-crt-off.png'});
  await crt.click();
  await expect(page.locator('html')).toHaveAttribute('data-crt','on');
  await page.screenshot({path:'test-results/arcade-crt-on.png'});
  await page.getByRole('textbox').fill('restoran');await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('region',{name:'Hasil tebakan'})).toBeVisible();
  await expect(page.locator('.next-button')).toHaveCSS('background-color','rgb(142, 224, 122)');
});

test('arcade controls work when embedded storage is unavailable',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(Storage.prototype,'getItem',{value:()=>{throw new DOMException('Blocked','SecurityError');}});
    Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new DOMException('Blocked','SecurityError');}});
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','arcade');
  await page.getByRole('button',{name:'Efek CRT',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-crt','off');
  await page.getByRole('button',{name:'Main',exact:true}).click();
  await expect(page.getByRole('textbox')).toBeVisible();
});

test('CRT light moves smoothly over content and stops with Motion, reduced motion, or CRT off',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await expect(page.locator('.crt-sweep')).toHaveCount(0);
  const beam=page.locator('.crt-scan-beam');
  await expect(page.locator('#crt-signal')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-crt-signal','on');
  await expect(page.locator('.crt-scan-beam')).toHaveCSS('animation-name','crt-scan');
  expect(await page.locator('.crt-scan-beam').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  const beamY=await page.locator('.crt-scan-beam').evaluate(el=>el.getBoundingClientRect().y);
  await expect.poll(()=>page.locator('.crt-scan-beam').evaluate(el=>el.getBoundingClientRect().y)).toBeGreaterThan(beamY+1);
  await expect(page.locator('.crt-screen')).toHaveCSS('filter',/crt-phosphor/);
  const frames=await beam.evaluate(el=>new Promise<number[]>(resolve=>{
    const positions:number[]=[];
    const sample=()=>{positions.push(el.getBoundingClientRect().y);if(positions.length<30)requestAnimationFrame(sample);else resolve(positions);};
    requestAnimationFrame(sample);
  }));
  expect(new Set(frames.map(y=>y.toFixed(2))).size).toBeGreaterThan(24);
  await page.getByRole('button',{name:'Main',exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-scene-state','idle');
  const bounds=await page.evaluate(()=>{
    const probe=document.createElement('div');probe.id='signal-probe';
    probe.style.cssText='position:absolute;left:50%;top:60%;width:48px;height:32px;background:#367844;pointer-events:none;z-index:90';
    document.querySelector('main')!.append(probe);
    const animation=document.querySelector('.crt-scan-beam')!.getAnimations()[0];
    animation.pause();animation.currentTime=0;
    return probe.getBoundingClientRect().toJSON();
  });
  const before=await page.screenshot({scale:'css'});
  await beam.evaluate((el,y)=>{el.getAnimations()[0].currentTime=((y/innerHeight+.08)/1.16)*12000;},bounds.y+bounds.height/2);
  const after=await page.screenshot({scale:'css'});
  const green=async(buffer:Buffer)=>{
    const {data,info}=await sharp(buffer).extract({left:Math.round(bounds.x)+12,top:Math.round(bounds.y)+10,width:16,height:12}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let sum=0;for(let i=1;i<data.length;i+=info.channels)sum+=data[i];
    return sum/(info.width*info.height);
  };
  expect(await green(after)-await green(before)).toBeGreaterThan(3);
  expect(await page.locator('#signal-probe').boundingBox()).toMatchObject({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});
  await page.evaluate(()=>{
    document.querySelector('#signal-probe')!.remove();
    document.querySelector('.crt-scan-beam')!.getAnimations()[0].play();
  });
  await page.getByRole('button',{name:'Pengaturan'}).click();
  await page.getByRole('button',{name:'Motion on',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-crt-signal','off');
  await expect(page.locator('.crt-scan-beam')).toHaveCSS('display','none');
  await expect(page.locator('.crt-screen')).toHaveCSS('filter',/crt-phosphor/);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Motion off',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-crt-signal','off');
  await page.getByRole('button',{name:'Tutup',exact:true}).click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('html')).toHaveAttribute('data-crt-signal','on');
  await page.getByRole('button',{name:'Efek CRT',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-crt-signal','off');
  await expect(page.locator('.crt-screen')).toHaveCSS('filter','none');
});


test('statistics stay readable inside narrow and short viewports',async({page})=>{
  await page.route('**/api/me/stats',route=>route.fulfill({json:{completed:123456,streak:1234,best:4228,average:3885}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Statistik',exact:true}).click();
  await expect(page.locator('.stats-grid strong').first()).toHaveText('123456');
  for(const [width,height] of [[320,568],[360,640],[390,844],[844,390],[320,320]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>document.fonts.ready);
    await expect.poll(()=>page.getByRole('dialog').evaluate(dialog=>{
      const box=dialog.getBoundingClientRect();
      const nodes=[dialog,...dialog.querySelectorAll<HTMLElement>('.modal-inner,header,h2,.stats-grid,.stats-grid>div,.stats-grid strong,.stats-grid span,.help-small')];
      return nodes.every(el=>el.scrollWidth<=el.clientWidth+1)&&box.left>=0&&box.right<=innerWidth;
    })).toBe(true);
    await expect(page.getByRole('button',{name:'Tutup',exact:true})).toBeInViewport();
  }
  await page.getByRole('button',{name:'Tutup',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

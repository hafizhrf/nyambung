import { test, expect } from '@playwright/test';

test('embedded Activity shows a configuration error and keeps its controls inside a narrow viewport', async ({ page }) => {
  await page.route('**/activity-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;overflow:hidden"><iframe id="activity" title="Nyambung Activity" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?frame_id=test-frame&instance_id=test-instance&platform=desktop"></iframe></body></html>' }));
  // This tests the real platform detector and UI, with integration explicitly
  // unavailable. OAuth/SDK success and session refresh have separate unit tests.
  await page.route('**/api/discord/bootstrap', route => route.fulfill({ status: 404, json: { error: 'Discord belum diaktifkan.' } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/activity-test');
  const activity = page.frameLocator('#activity');
  await expect(activity.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(activity.getByRole('button',{name:'Gunakan tema terang'})).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Pemain di Activity' })).toHaveCount(0);
  await expect(activity.getByRole('heading',{name:'Belum bisa membuka Nyambung'})).toBeVisible();
  await expect(activity.getByRole('button',{name:'Coba lagi',exact:true})).toBeVisible();
  await expect(activity.getByRole('button',{name:'Main',exact:true})).toHaveCount(0);
  await expect(activity.getByRole('alert')).toContainText('Discord belum diaktifkan.');
  await activity.locator('body').evaluate(async () => { await document.fonts.ready; });
  const bounds = await activity.locator('.site-header').evaluate(header => {
    const outside = Array.from(header.querySelectorAll('button')).filter(button => { const box = button.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth; });
    return { outside: outside.length, scrolls: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
  });
  expect(bounds).toEqual({ outside: 0, scrolls: false });
  await page.screenshot({path:'test-results/discord-dark-mode.png'});
  await activity.getByRole('button',{name:'Gunakan tema terang'}).click();
  await expect(activity.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();
  await expect(page.frameLocator('#activity').locator('html')).toHaveAttribute('data-theme','light');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');

});

test('Activity shows account and Daily loading states, then opens the game',async({page},testInfo)=>{
  test.setTimeout(45000);
  let releaseAuth!:()=>void,releaseDaily!:()=>void;
  const authGate=new Promise<void>(resolve=>releaseAuth=resolve);
  const dailyGate=new Promise<void>(resolve=>releaseDaily=resolve);
  const today=await(await page.request.get('/api/daily')).json();
  const userId='444444444444444444';
  const mobile=testInfo.project.name==='mobile';
  let participants=[{id:userId,name:'Alice',avatar:null,stages:0,completed:false,total:null as number|null}];
  await page.route('**/activity-loading-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe id="activity" style="position:fixed;inset:0;border:0;width:100%;height:100%" src="/?frame_id=test&instance_id=test-instance&platform=${mobile?'mobile':'desktop'}"></iframe></body></html>`}));
  await page.route('**/assets/*.js',async route=>{
    const response=await route.fetch();const body=await response.text();
    if(body.includes('as DiscordSDK'))return route.fulfill({contentType:'text/javascript',body:`export class DiscordSDK {instanceId='test-instance';async ready(){};subscribe(event,listener){if(event==='ACTIVITY_LAYOUT_MODE_UPDATE')window.__setActivityLayout=layout_mode=>listener({layout_mode});return ${mobile?'new Promise(()=>{})':'Promise.resolve()'};};commands={authorize:async()=>({code:'test-code'}),authenticate:async()=>({user:{id:'${userId}'}}),setActivity:async()=>({})};}`});
    return route.fulfill({response,body});
  });
  await page.route('**/api/discord/bootstrap',route=>route.fulfill({json:{applicationId:'111111111111111111',nonce:'test-nonce'}}));
  await page.route('**/api/discord/auth',async route=>{await authGate;return route.fulfill({json:{accessToken:'test-access',sessionToken:'1'.repeat(64),expiresAt:Date.now()+3600000,user:{id:userId,name:'Alice'},instanceId:'test-instance'}});});
  await page.route('**/api/daily',async route=>{await dailyGate;return route.fulfill({json:{...today,run:null}});});
  await page.route('**/api/random',route=>route.fulfill({json:{available:true,run:null}}));
  await page.route('**/api/runs',route=>route.fulfill({json:{id:'test-run',mode:'daily',date:today.date,number:today.number,demo:true,completed:false,total:0,results:[],current:{index:0,kind:'bridge2',clues:['makanan','mall']}}}));
  await page.route('**/api/discord/instances/*/progress*',route=>route.fulfill({json:{date:today.date,number:today.number,participants}}));
  await page.route('**/api/runs/test-run/answers',async route=>{
    expect(route.request().headers()['authorization']).toBe('Bearer '+'1'.repeat(64));
    expect(route.request().postDataJSON()).toMatchObject({stage:0,word:'restoran'});
    participants[0].stages=1;
    return route.fulfill({json:{id:'test-run',mode:'daily',date:today.date,number:today.number,demo:true,completed:false,total:1000,results:[{index:0,kind:'bridge2',clues:['makanan','mall'],word:'restoran',best:'restoran',explanation:'',score:1000,connections:[1,1],skipped:false}],current:{index:1,kind:'bridge2',clues:['hujan','panas']}}});
  });

  try{
    await page.setViewportSize({width:320,height:568});
    await page.goto('/activity-loading-test');const frame=page.frameLocator('#activity');
    await expect(frame.getByRole('heading',{name:'Sebentar, ya.'})).toBeVisible();
    await expect(frame.getByRole('status')).toContainText('Menghubungkan akun Discord');
    await expect(frame.getByRole('button',{name:'Main',exact:true})).toHaveCount(0);
    await expect(frame.getByRole('textbox')).toHaveCount(0);
    await page.screenshot({path:`test-results/${testInfo.project.name}-activity-loading.png`});
    releaseAuth();
    await expect(frame.getByRole('status')).toContainText('Menyiapkan Daily dan progresmu');
    await expect(frame.locator('.activity-loading-steps [data-state="done"]')).toContainText('Akun Discord');
    releaseDaily();
    await expect(frame.getByRole('textbox',{name:'SATU KATA VERSIMU'})).toBeVisible();
    await expect(frame.getByRole('region',{name:'Memuat Activity'})).toHaveCount(0);
    await expect(frame.getByRole('button',{name:'Pemain di Activity'})).toBeEnabled();
    await frame.getByRole('textbox',{name:'SATU KATA VERSIMU'}).fill('restoran');
    await frame.getByRole('textbox',{name:'SATU KATA VERSIMU'}).press('Enter');
    await expect(frame.getByRole('region',{name:'Hasil tebakan'})).toBeVisible();
    await frame.getByRole('button',{name:'Lanjut ke babak berikutnya'}).click();
    await expect(frame.getByRole('progressbar',{name:'Progres babak'})).toHaveAttribute('aria-valuenow','2');

    await expect(frame.locator('.room-trigger')).toHaveAttribute('data-live','true');
    await frame.getByRole('button',{name:'Pemain di Activity'}).click();
    await expect(frame.locator('.room-players li')).toHaveCount(1);
    participants=[...participants,{id:'555555555555555555',name:'Bob',avatar:null,stages:2,completed:false,total:null},{id:'666666666666666666',name:'Carol',avatar:null,stages:1,completed:false,total:null}];
    await expect(frame.locator('.room-players li')).toHaveCount(3,{timeout:10000});
    await expect(frame.locator('.room-live-summary')).toContainText('Live · 3 pemain');
    await expect(frame.locator('.room-trigger')).toHaveAttribute('title',/3 pemain aktif/);
    expect(await frame.locator('.site-header').evaluate(header=>Array.from(header.querySelectorAll('button')).every(button=>{const box=button.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth;}))).toBe(true);
    await page.screenshot({path:`test-results/${testInfo.project.name}-live-players.png`});
    await frame.getByRole('button',{name:'Tutup',exact:true}).click();
    const draft=frame.getByRole('textbox',{name:'SATU KATA VERSIMU'});
    await draft.fill('payung');
    await frame.getByRole('button',{name:'Cara bermain'}).click();
    await frame.locator('html').evaluate(()=>(window as any).__setActivityLayout(1));
    for(const [width,height] of [[320,180],[220,220],[160,160],[240,135]]){
      await page.setViewportSize({width,height});
      await expect(frame.getByRole('region',{name:'Ringkasan Activity'})).toBeVisible();
      await expect(frame.locator('.site-shell')).toBeHidden();
      await expect(frame.getByRole('dialog')).toHaveCount(0);
      await expect(frame.getByRole('progressbar',{name:'Babak selesai'})).toHaveAttribute('aria-valuenow','1');
      await expect(frame.locator('.activity-mini')).not.toContainText('payung');
      const fits=await frame.locator('.activity-mini').evaluate(root=>Array.from(root.querySelectorAll('header,.mini-status,.mini-clues,.mini-progress,.mini-hint')).every(el=>{const box=el.getBoundingClientRect();return box.left>=0&&box.top>=0&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1;}));
      expect(fits).toBe(true);
      expect(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`test-results/${testInfo.project.name}-pip-${width}x${height}.png`});
    }
    await frame.locator('html').evaluate(()=>(window as any).__setActivityLayout(2));
    await expect(frame.getByRole('region',{name:'Ringkasan Activity'})).toBeVisible();
    await page.setViewportSize({width:320,height:568});
    await frame.locator('html').evaluate(()=>(window as any).__setActivityLayout(0));
    await expect(draft).toHaveValue('payung');
    await expect(frame.getByRole('progressbar',{name:'Progres babak'})).toHaveAttribute('aria-valuenow','2');
    await frame.getByRole('button',{name:'Cara bermain'}).click();await expect(frame.getByRole('dialog')).toBeVisible();
    await frame.getByRole('button',{name:'Tutup',exact:true}).click();
    if(mobile){
      await draft.focus();await page.setViewportSize({width:320,height:280});
      await expect(frame.getByRole('region',{name:'Ringkasan Activity'})).toHaveCount(0);
      await page.setViewportSize({width:320,height:568});
    }
    await page.setViewportSize({width:220,height:220});
    await expect(frame.getByRole('region',{name:'Ringkasan Activity'})).toBeVisible();
    await page.setViewportSize({width:320,height:568});
    await expect(draft).toHaveValue('payung');
    await frame.getByRole('button',{name:'Pemain di Activity'}).click();

    participants=participants.slice(0,1);
    await expect(frame.locator('.room-players li')).toHaveCount(1,{timeout:10000});

  }finally{releaseAuth();releaseDaily();}
});

test('Activity retry returns to loading while reconnecting',async({page})=>{
  let attempts=0,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/activity-retry-test',route=>route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe id="activity" style="position:fixed;inset:0;border:0;width:100%;height:100%" src="/?frame_id=test&instance_id=test-instance"></iframe></body></html>'}));
  await page.route('**/api/discord/bootstrap',async route=>{attempts++;if(attempts>1)await gate;return route.fulfill({status:503,json:{error:'Koneksi Discord terputus.'}});});
  try{
    await page.goto('/activity-retry-test');const frame=page.frameLocator('#activity');
    await expect(frame.getByRole('alert')).toContainText('Koneksi Discord terputus');
    await frame.getByRole('button',{name:'Coba lagi',exact:true}).click();
    await expect(frame.getByRole('heading',{name:'Sebentar, ya.'})).toBeVisible();
    await expect(frame.getByRole('alert')).toHaveCount(0);
    release();await expect(frame.getByRole('alert')).toContainText('Koneksi Discord terputus');
  }finally{release();}
});

test('Activity header and dialogs stay clear of native Discord controls',async({page})=>{
  await page.route('**/activity-safe-area-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe id="activity" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?frame_id=test&instance_id=test-instance&platform=mobile"></iframe><div id="discord-toolbar" style="position:fixed;inset:0 0 auto;height:88px;z-index:20;background:#23272a;color:white;display:flex;align-items:center;justify-content:space-around">nyambung <span>Invite to Activities</span><span>Leave</span></div></body></html>'}));
  await page.route('**/api/discord/bootstrap',route=>route.fulfill({status:503,json:{error:'Koneksi contoh.'}}));
  await page.setViewportSize({width:390,height:844});await page.goto('/activity-safe-area-test');
  const frame=page.frameLocator('#activity');await expect(frame.locator('.site-header')).toBeVisible();
  await expect.poll(()=>frame.locator('.site-header').evaluate(el=>el.getBoundingClientRect().top)).toBe(56);
  await frame.locator('html').evaluate(el=>{
    el.style.setProperty('--discord-safe-area-inset-top','88px');el.style.setProperty('--discord-safe-area-inset-bottom','24px');
  });
  await expect.poll(()=>frame.locator('.site-header').evaluate(el=>el.getBoundingClientRect().top)).toBe(88);
  const footer=await frame.locator('.site-footer').boundingBox();expect(footer!.y+footer!.height).toBeLessThanOrEqual(820);
  await frame.getByRole('button',{name:'Gunakan tema terang'}).click();
  await frame.getByRole('button',{name:'Cara bermain'}).click();
  const modal=await frame.getByRole('dialog').boundingBox();expect(modal!.y).toBeGreaterThanOrEqual(88);expect(modal!.y+modal!.height).toBeLessThanOrEqual(820);
  await page.screenshot({path:'test-results/discord-safe-area.png'});
  await frame.locator('html').evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,value:430});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:12});visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(()=>frame.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(418);
  await expect.poll(()=>frame.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(100);
  await frame.locator('html').evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:0});visualViewport!.dispatchEvent(new Event('resize'));
  });

  await frame.getByRole('button',{name:'Tutup',exact:true}).click();
  await frame.locator('html').evaluate(el=>el.style.setProperty('--discord-safe-area-inset-top','44px'));
  await page.locator('#discord-toolbar').evaluate(el=>(el as HTMLElement).style.height='44px');
  await expect.poll(()=>frame.locator('.site-header').evaluate(el=>el.getBoundingClientRect().top)).toBe(44);
  await frame.getByRole('button',{name:'Gunakan tema gelap'}).click();
  await frame.locator('html').evaluate(el=>el.style.setProperty('--discord-safe-area-inset-top','0px'));
  await expect.poll(()=>frame.locator('.site-header').evaluate(el=>el.getBoundingClientRect().top)).toBe(0);
  await page.goto('/');await expect.poll(()=>page.locator('.site-header').evaluate(el=>el.getBoundingClientRect().top)).toBe(0);
});

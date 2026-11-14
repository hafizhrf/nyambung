import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {readFileSync} from "node:fs";
const lexicon=JSON.parse(readFileSync(new URL("../../content/lexicon.json",import.meta.url),"utf8")) as string[];
import { randomStages } from "../../content/random";
import type { RoomView } from "@nyambung/shared";
test.skip(
  process.env.MABAR_ENABLED !== "true",
  "Mabar uses its own enabled server run.",
);
test.describe.configure({ timeout: 90000 });
async function setup(
  browser: Browser,
  mode: string,
  count = 2,
  mobile = false,
  animated = false,
) {
  const contexts: BrowserContext[] = [],
    pages: Page[] = [];
  for (let n = 0; n < count; n++) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: animated ? "no-preference" : "reduce",
    });
    contexts.push(context);
    await context.request.post("/api/mabar/profile", {
      data: { name: `Tamu ${n}` },
    });
  }
  const response = await contexts[0].request.post("/api/mabar/rooms", {
    data: {
      name: "Room tes",
      visibility: "unlisted",
      capacity: 8,
      mode,
      rounds: mode === "quick" ? 5 : mode === "word" ? 3 : 1,
      seconds: mode === "word" ? 10 : 20,
    },
  });
  const room = (await response.json()) as RoomView;
  for (const context of contexts) {
    const page = await context.newPage();
    pages.push(page);
    await page.goto(`/?room=${room.id}`);
    await expect(page.locator(".mabar-heading [role=status]")).toHaveText(
      "Live",
    );
  }
  const snapshot = async (n = 0) =>
    (await contexts[n].request
      .get(`/api/mabar/rooms/${room.id}`)
      .then((r) => r.json())) as RoomView;
  const advance = async (milliseconds: number) => {
    await contexts[0].request.post("/api/mabar-test/advance", {
      data: { milliseconds },
    });
  };
  const phase = async (value: string) => {
    await expect.poll(async () => (await snapshot()).match?.phase).toBe(value);
  };
  return {
    contexts,
    pages,
    room,
    snapshot,
    advance,
    phase,
    close: () => Promise.all(contexts.map((c) => c.close())),
  };
}
for (const mode of ["quick", "word", "chain"])
  test(`multiplayer ${mode} completes across separate guests`, async ({
    browser,
  }, testInfo) => {
    const g = await setup(
      browser,
      mode,
      mode === "chain" ? 3 : 2,
      testInfo.project.name === "mobile",
      mode === "word",
    );
    try {
      await g.pages[0].screenshot({
        path: `test-results/mabar-${mode}-lobby-${testInfo.project.name}.png`,
      });
      for (const p of g.pages)
        await p.getByRole("button", { name: "Siap", exact: true }).click();
      await g.pages[0]
        .getByRole("button", { name: "Mulai", exact: true })
        .click();
      await g.phase("countdown");
      await g.advance(3001);
      await g.phase("playing");
      await g.pages[0].screenshot({
        path: `test-results/mabar-${mode}-playing-${testInfo.project.name}.png`,
      });
      if (mode === "chain") {
        for (let stage = 0; stage < 3; stage++) {
          for (const p of g.pages) {
            if (stage % 2 === 0) {
              const input = p.locator(".mabar-arena input");
              await expect(input).toBeVisible();
              await input.fill(stage === 0 ? "kucing tidur" : "kucing");
            } else {
              const target = p.locator('canvas[aria-label="Kanvas gambar"]');
              await expect(target).toBeVisible();
              const box = (await target.boundingBox())!;
              if (testInfo.project.name === "mobile")
                await p.touchscreen.tap(box.x + 40, box.y + 40);
              else {
                await p.mouse.move(box.x + 20, box.y + 20);
                await p.mouse.down();
                await p.mouse.move(box.x + 80, box.y + 70, { steps: 10 });
                await p.mouse.up();
              }
              await expect
                .poll(() =>
                  p.evaluate(() =>
                    document
                      .elementFromPoint(innerWidth / 2, innerHeight - 2)
                      ?.getAttribute("aria-label"),
                  ),
                )
                .not.toBe("Kanvas gambar");
              if (p === g.pages[0])
                await p.screenshot({
                  path: `test-results/mabar-chain-canvas-${testInfo.project.name}.png`,
                });
            }
            await p.getByRole("button", { name: "Kunci", exact: true }).click();
          }
          await g.advance(3100);
          await expect
            .poll(async () => (await g.snapshot()).match!.stage)
            .toBe(stage + 1);
        }
        await g.phase("gallery");
        for (let n = 0; n < 3; n++) {
          await g.pages[0]
            .getByRole("button", { name: "Rantai berikutnya" })
            .click();
          await expect
            .poll(async () => (await g.snapshot()).match!.galleryIndex)
            .toBe(n + 1);
        }
        await g.phase("voting");
        for (const p of g.pages)
          await p
            .getByRole("button", { name: /Pilih rantai/ })
            .first()
            .click();
        await g.advance(30001);
      } else if (mode === "word") {
        // The first player chains a word; the next runs out of time and is eliminated.
        const current = await g.snapshot();
        const selves = await Promise.all(
          g.pages.map((_, n) => g.snapshot(n).then((v) => v.self)),
        );
        const turn = selves.indexOf(current.match!.turn!);
        const waiting = g.pages[1 - turn];
        const chooseWord=(view:RoomView)=>lexicon.find(word=>/^[a-z]{2,32}$/.test(word)&&word.startsWith(view.match!.requiredPrefix!)&&!view.match!.used!.includes(word))!;
        const initialWord=chooseWord(current);
        await expect(g.pages[turn].locator('.word-suffixes b')).toHaveCount(1);
        await expect(g.pages[turn].locator('.word-suffixes b')).toHaveText(current.match!.requiredPrefix!.toUpperCase());
        await expect(waiting.getByText("Tunggu giliranmu", { exact: false })).toBeVisible();
        await g.pages[turn]
          .getByRole("textbox", { name: "Jawaban mabar" })
          .fill(initialWord);
        await g.pages[turn].getByRole("button", { name: "Kirim", exact: true }).click();
        await expect.poll(async () => (await g.snapshot()).match!.turn).toBe(
          selves[1 - turn],
        );
        await expect(waiting.getByText("Giliranmu!", { exact: true })).toBeVisible();
        await expect(waiting.locator(".used-words")).toContainText(initialWord);
        const field=waiting.getByRole('textbox',{name:'Jawaban mabar'});
        await field.evaluate(el=>{const node=el as HTMLInputElement,animate=node.animate.bind(node);node.animate=(...args)=>{node.dataset.shakes=String(Number(node.dataset.shakes??0)+1);return animate(...args);};});
        const beforeRetry=(await g.snapshot()).match!;
        await field.fill('rumah');await waiting.getByRole('button',{name:'Kirim',exact:true}).click();
        await expect(waiting.getByRole('alert')).toContainText('sudah dipakai');
        await expect(field).toHaveValue('rumah');await expect(field).toBeFocused();
        await expect(field).toHaveAttribute('aria-invalid','true');await expect(field).toHaveAttribute('data-shakes','1');
        expect((await g.snapshot()).match!.lives).toEqual(beforeRetry.lives);
        expect((await g.snapshot()).match!.deadline).toBe(beforeRetry.deadline);
        await field.fill(chooseWord(await g.snapshot()));await waiting.getByRole('button',{name:'Kirim',exact:true}).click();
        await expect.poll(async()=>(await g.snapshot()).match!.turn).toBe(selves[turn]);
        await g.pages[turn].getByRole('textbox',{name:'Jawaban mabar'}).fill(chooseWord(await g.snapshot()));
        await g.pages[turn].getByRole('button',{name:'Kirim',exact:true}).click();
        await expect.poll(async()=>(await g.snapshot()).match!.turn).toBe(selves[1-turn]);

        await g.advance(11000);
        await g.phase("reveal");
        await expect(g.pages[turn].locator(".reveal-answer")).toContainText("kehilangan 1 nyawa");
        await expect(waiting.locator('.word-failure-details')).toContainText('Tidak mengirim jawaban');
        await expect(waiting.locator('.word-failure-examples b').first()).toBeVisible();
        expect((await g.snapshot()).match!.lives![selves[1-turn]]).toBe(1);
        await expect(waiting.getByRole('img',{name:`Nyawa Tamu ${1-turn}: 1 dari 2 nyawa`,exact:true})).toBeVisible();
        await g.advance(5001);await g.phase('playing');
        await g.pages[turn].getByRole('textbox',{name:'Jawaban mabar'}).fill(chooseWord(await g.snapshot()));
        await g.pages[turn].getByRole('button',{name:'Kirim',exact:true}).click();
        await expect.poll(async()=>(await g.snapshot()).match!.turn).toBe(selves[1-turn]);
        await waiting.getByRole('textbox',{name:'Jawaban mabar'}).fill('zzzzzzzz');
        await waiting.getByRole('button',{name:'Kirim',exact:true}).click();
        await g.phase('reveal');
        await expect(g.pages[turn].locator('.failed-attempt')).toHaveText('zzzzzzzz');
        await expect(g.pages[turn].locator('.word-failure-examples b').first()).toBeVisible();
        await g.pages[turn].screenshot({path:`test-results/mabar-word-failure-${testInfo.project.name}.png`});
        await expect(g.pages[turn].locator('.reveal-answer')).toContainText('gugur');
        expect((await g.snapshot()).match!.lives![selves[1-turn]]).toBe(0);
        await g.advance(5001);
      } else {
        const total = (await g.snapshot()).match!.total;
        for (let n = 0; n < total; n++) {
          if (n === 0 && testInfo.project.name === "mobile") {
            const p = g.pages[0];
            await p.getByRole("textbox", { name: "Jawaban mabar" }).focus();
            await p.evaluate(() => {
              Object.defineProperty(visualViewport, "height", {
                configurable: true,
                value: 430,
              });
              visualViewport!.dispatchEvent(new Event("resize"));
            });
            await expect(p.locator("html")).toHaveAttribute(
              "data-keyboard",
              "open",
            );
            await expect
              .poll(() =>
                p
                  .getByRole("textbox", { name: "Jawaban mabar" })
                  .evaluate((el) => el.getBoundingClientRect().bottom),
              )
              .toBeLessThanOrEqual(430);
            await p.evaluate(() => {
              Object.defineProperty(visualViewport, "height", {
                configurable: true,
                value: innerHeight,
              });
              visualViewport!.dispatchEvent(new Event("resize"));
            });
          }
          const current = await g.snapshot();
          const key = (clues: string[]) => [...clues].sort().join("|");
          const stage = randomStages.find(
            (s) => key(s.clues) === key(current.match!.clues!),
          )!;
          await expect(g.pages[0].locator(".clue-chips")).toContainText(
            current.match!.clues![0],
          );
          for (const p of g.pages) {
            await p
              .getByRole("textbox", { name: "Jawaban mabar" })
              .fill(stage.best);
            await p.getByRole("button", { name: "Kirim", exact: true }).click();
            if(p===g.pages[0])for(const viewer of g.pages){
              await expect(viewer.locator('.mabar-player').filter({hasText:'Tamu 0'}).locator('.player-answered')).toContainText('Sudah nebak');
              await expect(viewer.locator('.player-answered')).toHaveCount(1);
            }
          }
          // Everyone answered, so the round reveals without waiting for the timer.
          await g.phase("reveal");
          await expect(g.pages[0].locator(".reveal-answer")).toHaveText(
            stage.best,
          );
          await g.advance(6001);
          if (n + 1 < total) {await g.phase("playing");await expect(g.pages[0].locator(".player-answered")).toHaveCount(0);}
        }
      }
      await g.phase("results");
      for (const p of g.pages) {
        await expect(
          p.getByRole("heading", { name: "Hasil mabar" }),
        ).toBeVisible();
        expect(
          await p
            .locator(".mabar-page")
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
      }
      const download = g.pages[0].waitForEvent("download");
      await g.pages[0].getByRole("button", { name: "Simpan gambar" }).click();
      const imageDownload = await download;
      expect(imageDownload.suggestedFilename()).toMatch(/nyambung-mabar.*png/);
      await imageDownload.saveAs(
        `test-results/mabar-share-${mode}-${testInfo.project.name}.png`,
      );
      await g.pages[0].screenshot({
        path: `test-results/${testInfo.project.name}-mabar-${mode}.png`,
      });
      await g.pages[1].reload();
      await expect(
        g.pages[1].getByRole("heading", { name: "Hasil mabar" }),
      ).toBeVisible();
    } finally {
      await g.close();
    }
  });
test("web lobby creates a password room and supports narrow screens", async ({
  page,
}, testInfo) => {
  // Each project shares one server, so the room name must be unique per run.
  const roomName = `Room Lobby ${testInfo.project.name}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Mabar", exact: true }).click();
  await page.getByLabel("Nama guest").fill("Tamu Pixel");
  await page.getByRole("button", { name: "Simpan profil" }).click();
  await page.getByRole("button", { name: "Buat room", exact: true }).click();
  await page.getByLabel("Nama room").fill(roomName);
  await page.getByLabel("Password", { exact: true }).fill("rahasia");
  await page.getByRole("button", { name: "Buat dan masuk" }).click();
  await expect(page.getByRole("heading", { name: roomName })).toBeVisible();
  await expect(page.locator(".mabar-heading [role=status]")).toHaveText("Live");
  const guide = page.locator('.mode-guide');
  await expect(guide.locator('.guide-rules')).not.toBeVisible();
  await expect(page.locator('.guide-facts')).toBeVisible();
  await expect(page.getByRole('button',{name:'Siap',exact:true})).toBeVisible();
  await guide.locator('summary').click();
  await expect(guide.locator('.guide-rules')).toBeVisible();
  await guide.locator('summary').press('Enter');
  await expect(guide.locator('.guide-rules')).not.toBeVisible();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page
        .locator(".mabar-page")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Keluar room" }).click();
  await expect(
    page.getByRole("button", { name: "Buat room", exact: true }),
  ).toBeVisible();
  // The last member leaving closes the room instead of leaving it listed.
  await expect(page.getByRole("alert")).toHaveCount(0);
  const rooms = (await page.request
    .get("/api/mabar/rooms")
    .then((r) => r.json())) as { name: string }[];
  expect(rooms.map((r) => r.name)).not.toContain(roomName);
  await expect(page.getByText(roomName)).toHaveCount(0);
});

test("Discord SDK defaults to Daily and opens the shared lobby from Mabar", async ({
  browser,
}, testInfo) => {
  // A fresh Activity instance per project keeps earlier matches out of this lobby.
  const instance = `mabar-e2e-${testInfo.project.name}`;
  const contexts: BrowserContext[] = [];
  try {
    for (const person of ["alice", "bob"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      contexts.push(context);
      const page = await context.newPage();
      await page.route("**/mabar-discord-test", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe id="activity" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?frame_id=test&instance_id=${instance}&platform=desktop&person=${person}"></iframe>`,
        }),
      );
      await page.route("**/assets/*.js", async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        if (body.includes("as DiscordSDK"))
          return route.fulfill({
            contentType: "text/javascript",
            body: `export class DiscordSDK {instanceId='${instance}';ready(){return Promise.resolve()};subscribe(event,listener){if(event==='ACTIVITY_LAYOUT_MODE_UPDATE')window.__setMabarLayout=layout_mode=>listener({layout_mode});return Promise.resolve()};commands={authorize:async()=>({code:'${person}'}),authenticate:async()=>({user:{id:'${person === "alice" ? "444444444444444444" : "555555555555555555"}'}}),setActivity:async()=>({})};}`,
          });
        return route.fulfill({ response, body });
      });
      await page.goto("/mabar-discord-test");
      const frame = page.frameLocator("#activity");
      await expect(frame.getByRole("textbox", { name: "SATU KATA VERSIMU" })).toBeVisible();
      await expect(frame.getByRole("button", { name: "Solo", exact: true })).toHaveAttribute("aria-pressed", "true");
      await frame.getByRole("button", { name: "Mabar", exact: true }).click();
      await expect(
        frame.getByRole("heading", { name: "Mabar Nyambung" }),
      ).toBeVisible();
      await expect(frame.locator(".mabar-heading [role=status]")).toHaveText(
        "Live",
      );
      await expect(frame.getByLabel("Nama guest")).toHaveCount(0);
    }
    const a = contexts[0].pages()[0].frameLocator("#activity"),
      b = contexts[1].pages()[0].frameLocator("#activity");
    await expect(a.locator(".mabar-player")).toHaveCount(2);
    await expect(a.locator(".mabar-players")).toContainText("Alice");
    await expect(b.locator(".mabar-players")).toContainText("Bob");
    await a.getByRole("button", { name: "Siap", exact: true }).click();
    await b.getByRole("button", { name: "Siap", exact: true }).click();
    await a.getByRole("button", { name: "Mulai", exact: true }).click();
    await contexts[0].request.post("/api/mabar-test/advance", {
      data: { milliseconds: 3100 },
    });
    await expect(
      a.getByRole("textbox", { name: "Jawaban mabar" }),
    ).toBeVisible();
    await a
      .getByRole("textbox", { name: "Jawaban mabar" })
      .fill("draft rahasia");
    for (const [width, height] of [
      [320, 180],
      [220, 220],
      [160, 160],
      [240, 135],
    ]) {
      await contexts[0].pages()[0].setViewportSize({ width, height });
      await a.locator("body").evaluate(() => {
        (window as any).__setMabarLayout(1);
      });
      await expect(a.locator(".mabar-mini")).toBeVisible();
      await expect(
        a.getByRole("textbox", { name: "Jawaban mabar" }),
      ).not.toBeVisible();
      expect(
        await a
          .locator(".mabar-mini")
          .evaluate(
            (el) =>
              el.scrollWidth <= el.clientWidth + 1 &&
              el.scrollHeight <= el.clientHeight + 1,
          ),
      ).toBe(true);
    }
    await contexts[0].pages()[0].setViewportSize({ width: 390, height: 844 });
    await a.locator("body").evaluate(() => {
      (window as any).__setMabarLayout(0);
    });
    await expect(a.getByRole("textbox", { name: "Jawaban mabar" })).toHaveValue(
      "draft rahasia",
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('mode selector stays in the arcade header without splitting the home layout',async({page})=>{
  await page.goto('/');
  const selector=page.getByRole('navigation',{name:'Pilihan permainan'});
  await expect(page.locator('.site-header').getByRole('navigation',{name:'Pilihan permainan'})).toBeVisible();
  for(const [width,height] of [[1280,800],[844,390],[390,844],[320,568],[390,430],[320,430]]){
    await page.setViewportSize({width,height});
    await expect.poll(()=>selector.evaluate(el=>{const header=el.closest('header')!.getBoundingClientRect(),box=el.getBoundingClientRect();return box.top>=header.top-1&&box.bottom<=header.bottom+1&&header.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1;})).toBe(true);
    await expect(page.getByRole('button',{name:'Main',exact:true})).toBeInViewport();
    await page.screenshot({path:`test-results/mode-selector-${width}x${height}.png`});
  }
  await selector.getByRole('button',{name:'Mabar',exact:true}).click();
  await expect(selector.getByRole('button',{name:'Mabar',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('Nama guest')).toBeVisible();
  await selector.getByRole('button',{name:'Solo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Main',exact:true})).toBeVisible();
});

test('room controls use pixel menus and stay aligned on narrow screens', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:'Mabar', exact:true}).click();
  await page.getByLabel('Nama guest').fill('Pixel Guest');
  await page.getByRole('button', {name:'Simpan profil'}).click();
  await page.getByRole('button', {name:'Ubah profil'}).click();
  await expect(page.getByLabel('Foto', {exact:true})).toHaveAttribute('type', 'file');
  await page.getByRole('button', {name:'Batal', exact:true}).click();
  // Lobby sections are separate tabs, not one long page.
  await expect(page.getByLabel('Kode room')).toHaveCount(0);
  await page.getByRole('button', {name:'Pakai kode', exact:true}).click();
  await expect(page.getByLabel('Kode room')).toBeVisible();
  await expect(page.getByLabel('Cari room')).toHaveCount(0);
  const heights = await page.locator('.mabar-join').evaluate(el => [...el.querySelectorAll('input,button')].map(c => Math.round(c.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  await page.getByRole('button', {name:'Buat room',exact:true}).click();
  const settings = page.locator('.mabar-settings');
  await settings.getByRole('button', {name:'Mode',exact:true}).click();
  await page.getByRole('option', {name:'Sambung Kata',exact:true}).click();
  await expect(settings.getByRole('button', {name:'Waktu awal',exact:true})).toContainText('10 dtk');
  await expect(settings.getByRole('button', {name:'Putaran',exact:true})).toHaveCount(0);
  const capacity = settings.getByRole('button', {name:'Kapasitas',exact:true});
  await capacity.focus();
  await capacity.press('ArrowDown');
  await page.getByRole('listbox', {name:'Kapasitas'}).press('End');
  await page.getByRole('listbox', {name:'Kapasitas'}).press('Enter');
  await expect(capacity).toContainText('12');
  await capacity.click();
  await page.getByRole('listbox', {name:'Kapasitas'}).press('Escape');
  await expect(capacity).toBeFocused();
  for (const [width,height] of [[1280,800],[390,844],[320,568],[844,390]]) {
    await page.setViewportSize({width,height});
    expect(await page.locator('.mabar-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await settings.getByRole('button', {name:'Mode',exact:true}).click();
    await expect(page.getByRole('option', {name:'Tebak Cepat',exact:true})).toBeVisible();
    await page.screenshot({path:`test-results/mabar-controls-${width}x${height}.png`});
    await page.getByRole('listbox', {name:'Mode'}).press('Escape');
  }
  await page.getByLabel('Nama room', {exact:true}).fill('Room Pixel');
  await page.getByRole('button', {name:'Buat dan masuk',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Room Pixel'})).toBeVisible();
});


test('CRT Mabar transitions preserve a focused draft across live timer updates',async({browser})=>{
  const g=await setup(browser,'quick',2,false,true);
  try{
    for(const page of g.pages)await page.getByRole('button',{name:'Siap',exact:true}).click();
    await g.pages[0].getByRole('button',{name:'Mulai',exact:true}).click();
    await g.phase('countdown');await g.advance(3001);await g.phase('playing');
    const page=g.pages[0],input=page.getByRole('textbox',{name:'Jawaban mabar'});
    await expect(input).toBeVisible();
    await expect(page.locator('.mabar-page')).toHaveAttribute('data-scene-state','idle');
    await input.fill('tetap');
    await page.evaluate(()=>{
      (window as any).__mabarSceneReentries=0;
      const scene=document.querySelector('.mabar-page')!;
      new MutationObserver(()=>{if(scene.getAttribute('data-scene-state')==='entering')(window as any).__mabarSceneReentries++;}).observe(scene,{attributes:true,attributeFilter:['data-scene-state']});
    });
    await page.waitForTimeout(1100);
    await expect(input).toHaveValue('tetap');await expect(input).toBeFocused();
    expect(await page.evaluate(()=>(window as any).__mabarSceneReentries)).toBe(0);
  }finally{await g.close();}
});

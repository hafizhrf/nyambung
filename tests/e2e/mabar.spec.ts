import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { quickQuestions } from "../../content/mabar-questions";
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
      reducedMotion: "reduce",
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
      rounds:
        mode === "quick"
          ? 5
          : mode === "semantic"
            ? 5
            : mode === "word"
              ? 3
              : 1,
      seconds: mode === "word" ? 10 : mode === "semantic" ? 30 : 20,
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
for (const mode of ["quick", "semantic", "word", "chain"])
  test(`multiplayer ${mode} completes across separate guests`, async ({
    browser,
  }, testInfo) => {
    const g = await setup(
      browser,
      mode,
      mode === "chain" ? 3 : 2,
      testInfo.project.name === "mobile",
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
      } else {
        const total = (await g.snapshot()).match!.total;
        for (let n = 0; n < total; n++) {
          if (mode === "quick") {
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
            const answer = quickQuestions.find(
              (q) => q.prompt === current.match!.prompt,
            )!.answers[0];
            for (const p of g.pages) {
              await p
                .getByRole("textbox", { name: "Jawaban mabar" })
                .fill(answer);
              await p
                .getByRole("button", { name: "Kirim", exact: true })
                .click();
              await expect(
                p.getByText("Jawaban terkunci", { exact: true }),
              ).toBeVisible();
            }
          }
          await g.advance(46000);
          await g.phase("reveal");
          await g.advance(5001);
          if (n + 1 < total) await g.phase("playing");
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
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mabar", exact: true }).click();
  await page.getByLabel("Nama guest").fill("Tamu Pixel");
  await page.getByRole("button", { name: "Simpan profil" }).click();
  await page.getByRole("button", { name: "Buat room", exact: true }).click();
  await page.getByLabel("Nama room").fill("Room Pixel");
  await page.getByLabel("Password", { exact: true }).fill("rahasia");
  await page.getByRole("button", { name: "Buat dan masuk" }).click();
  await expect(page.getByRole("heading", { name: "Room Pixel" })).toBeVisible();
  await expect(page.locator(".mabar-heading [role=status]")).toHaveText("Live");
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
});

test("Discord SDK opens the verified shared lobby and PiP hides private input", async ({
  browser,
}) => {
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
          body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe id="activity" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?frame_id=test&instance_id=mabar-e2e&platform=desktop&person=${person}"></iframe>`,
        }),
      );
      await page.route("**/assets/*.js", async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        if (body.includes("as DiscordSDK"))
          return route.fulfill({
            contentType: "text/javascript",
            body: `export class DiscordSDK {instanceId='mabar-e2e';ready(){return Promise.resolve()};subscribe(event,listener){if(event==='ACTIVITY_LAYOUT_MODE_UPDATE')window.__setMabarLayout=layout_mode=>listener({layout_mode});return Promise.resolve()};commands={authorize:async()=>({code:'${person}'}),authenticate:async()=>({user:{id:'${person === "alice" ? "444444444444444444" : "555555555555555555"}'}}),setActivity:async()=>({})};}`,
          });
        return route.fulfill({ response, body });
      });
      await page.goto("/mabar-discord-test");
      const frame = page.frameLocator("#activity");
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

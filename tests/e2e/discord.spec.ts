import { test, expect } from '@playwright/test';

test('embedded Activity shows a configuration error and keeps its controls inside a narrow viewport', async ({ page }) => {
  await page.route('**/activity-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;overflow:hidden"><iframe id="activity" title="Nyambung Activity" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?frame_id=test-frame&instance_id=test-instance&platform=desktop"></iframe></body></html>' }));
  // This tests the real platform detector and UI, with integration explicitly
  // unavailable. OAuth/SDK success and session refresh have separate unit tests.
  await page.route('**/api/discord/bootstrap', route => route.fulfill({ status: 404, json: { error: 'Discord belum diaktifkan.' } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/activity-test');
  const activity = page.frameLocator('#activity');
  await expect(activity.getByRole('button', { name: 'Pemain di Activity' })).toBeDisabled();
  await expect(activity.getByRole('alert')).toContainText('Discord belum diaktifkan.');
  await activity.locator('body').evaluate(async () => { await document.fonts.ready; });
  const bounds = await activity.locator('.site-header').evaluate(header => {
    const outside = Array.from(header.querySelectorAll('button')).filter(button => { const box = button.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth; });
    return { outside: outside.length, scrolls: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
  });
  expect(bounds).toEqual({ outside: 0, scrolls: false });
});

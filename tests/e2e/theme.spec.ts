import { test, expect } from '@playwright/test';

test('browser theme defaults to light and persists a manual dark theme across game and dialogs',async({page})=>{
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Gunakan tema gelap'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#101722');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'Cara bermain'}).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color','rgb(24, 34, 48)');
  await page.getByRole('button',{name:'Tutup',exact:true}).click();
  await page.getByRole('button',{name:'Main',exact:true}).click();
  await expect(page.locator('.game-paper')).toHaveCSS('background-color','rgb(24, 34, 48)');
  await expect(page.getByRole('textbox')).toHaveCSS('color','rgb(229, 237, 248)');
  await page.screenshot({path:'test-results/dark-game.png'});
  await page.getByRole('textbox').fill('restoran');await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('region',{name:'Hasil tebakan'})).toBeVisible();
  await expect(page.locator('.next-button')).toHaveCSS('background-color','rgb(24, 123, 66)');
});

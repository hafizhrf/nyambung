/** Regenerate upright bot labels: node --import tsx scripts/arcade-atlas.ts */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const root='apps/web/public/assets';
const font=(await readFile(`${root}/arcade/press-start-2p.ttf`)).toString('base64');
const original=(await readFile(`${root}/dungeon/dungeon-mode.png`)).toString('base64');
const charset=await readFile(`${root}/dungeon/dungeon-mode.char`,'utf8');
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const png=await page.evaluate(async({font,original,charset})=>{
    const face=new FontFace('Arcade Pixel',`url(data:font/ttf;base64,${font})`);
    document.fonts.add(await face.load());
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d')!;
    const image=new Image();image.src=`data:image/png;base64,${original}`;await image.decode();
    ctx.drawImage(image,0,0);ctx.font='8px "Arcade Pixel"';ctx.fillStyle='#fff';
    const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
    charset.split(/\r?\n/).slice(3,19).forEach((row,y)=>{
      Array.from(segmenter.segment(row),part=>part.segment).forEach((char,x)=>{
        // Keep the supplied symbols; replace printable ASCII with the upright face.
        if(char.length===1&&char.charCodeAt(0)>=32&&char.charCodeAt(0)<=126){
          ctx.clearRect(x*8,y*8,8,8);ctx.fillText(char,x*8,y*8+8);
        }
      });
    });
    return canvas.toDataURL('image/png').split(',')[1];
  },{font,original,charset});
  await writeFile(`${root}/arcade/arcade-labels.png`,Buffer.from(png,'base64'));
} finally { await browser.close(); }

import type { RunView } from '@nyambung/shared';
import { crtImage } from '../../../packages/shared/src/crtImage.js';

export function downloadImage(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function createResultImage(run: RunView): Promise<File> {
  if (!run.completed || run.results.length !== 5) throw new Error('Selesaikan permainan untuk membagikan hasil.');
  await document.fonts.load('32px "Arcade Pixel"');
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Gambar belum bisa dibuat. Coba lagi.');
  ctx.imageSmoothingEnabled=false;
  const gold='#edcb78', ink='#f0e9cb', muted='#b0a8c0', purple='#c69af2';
  const num=(n:number)=>n.toLocaleString('id-ID');
  const text=(value:string,x:number,y:number,size:number,color=ink,maxWidth=928)=>{
    ctx.font=`${size}px "Arcade Pixel", monospace`; ctx.fillStyle=color;
    ctx.fillText(value,x,y,maxWidth);
  };
  const line=(y:number)=>{ctx.fillStyle='#39334c';ctx.fillRect(76,y,928,2);};
  ctx.fillStyle='#08090d';ctx.fillRect(0,0,1080,1350);
  ctx.strokeStyle=gold;ctx.lineWidth=4;ctx.strokeRect(28,28,1024,1294);
  ctx.strokeStyle='#66513b';ctx.lineWidth=2;ctx.strokeRect(38,38,1004,1274);
  text('NYAMBUNG',76,134,72,gold);
  line(207);
  const mode=run.mode==='random'?'RANDOM PLAY':`DAILY #${String(run.number).padStart(3,'0')}`;
  text(mode,76,263,28,purple,450);
  const date=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${run.date}T12:00:00+07:00`));
  ctx.textAlign='right';text(date,1004,263,24,muted,450);ctx.textAlign='left';
  text('SKOR AKHIR',76,337,28,muted);
  text(num(run.total),70,474,128,gold,720);
  text('dari 5.000 poin',76,525,28,muted);
  const labels={bridge2:'Dua kata',bridge3:'Tiga kata',closest:'Dekat makna'};
  run.results.forEach((result,index)=>{
    const y=564+index*110;
    ctx.fillStyle=index%2?'#13101b':'#14150f';ctx.fillRect(76,y,928,102);
    ctx.strokeStyle=index%2?'#43324f':'#494132';ctx.lineWidth=2;ctx.strokeRect(76,y,928,102);
    text(`0${index+1}`,88,y+58,24,purple,52);
    text(labels[result.kind],144,y+45,28,ink,300);
    text(result.skipped?'Dilewati':`${num(result.score)} dari 1.000`,144,y+78,20,muted,300);
    const strength=Math.max(0,Math.min(1,result.score/1000));
    ctx.save();
    for(let cell=0;cell<16;cell++) {
      const x=492+cell*19,yBar=y+38;
      ctx.fillStyle='#293325';ctx.fillRect(x,yBar,13,22);
      const fill=Math.max(0,Math.min(1,strength*16-cell));
      if(fill){ctx.fillStyle=purple;ctx.fillRect(x,yBar,Math.round(13*fill),22);}
    }
    ctx.restore();ctx.textAlign='right';text(num(result.score),1004,y+65,38,gold,172);ctx.textAlign='left';
  });
  line(1114);
  if(run.demo)text('MODE DEMO',76,1160,20,muted);
  text('Main di nyambung.web.id',76,1220,28,gold);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  pixels.data.set(crtImage(pixels.data,canvas.width,canvas.height));
  ctx.putImageData(pixels,0,0);
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Gambar belum bisa dibuat. Coba lagi.')),'image/png'));
  const label = run.mode === 'random' ? `acak-${run.id.slice(0,8)}` : `daily-${String(run.number).padStart(3,'0')}`;
  return new File([blob],`nyambung-${label}-${run.date}.png`,{type:'image/png'});
}

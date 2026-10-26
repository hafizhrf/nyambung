import type { RunView } from '@nyambung/shared';
import { resultWave } from './resultWave';

export function downloadImage(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function createResultImage(run: RunView): Promise<File> {
  if (!run.completed || run.results.length !== 5) throw new Error('Selesaikan permainan untuk membagikan hasil.');
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Gambar belum bisa dibuat. Coba lagi.');
  const blue = '#1c7af8', ink = '#25364e', muted = '#7b8799';
  const num = (n:number) => n.toLocaleString('id-ID');
  const text = (value:string, x:number, y:number, size:number, color = ink, weight = 400, family = 'DM Sans Variable') => {
    ctx.font = `${weight} ${size}px "${family}", sans-serif`; ctx.fillStyle = color; ctx.fillText(value,x,y);
  };
  const line = (y:number) => { ctx.beginPath(); ctx.moveTo(76,y); ctx.lineTo(1004,y); ctx.strokeStyle='#e2e8f1'; ctx.lineWidth=2; ctx.stroke(); };
  ctx.fillStyle='#fbfcff'; ctx.fillRect(0,0,1080,1350);
  ctx.fillStyle='#dfe6f2';
  for(let x=12;x<1080;x+=22) for(let y=12;y<1350;y+=22) {ctx.beginPath();ctx.arc(x,y,.8,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#ffffff'; ctx.beginPath();ctx.roundRect(44,40,992,1270,28);ctx.fill();
  ctx.strokeStyle='#e2e8f1';ctx.lineWidth=2;ctx.stroke();
  ctx.save();ctx.translate(108,111);ctx.rotate(-.12);ctx.fillStyle=blue;ctx.beginPath();ctx.roundRect(-34,-34,68,68,18);ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.lineCap='round';
  ctx.rotate(-.65);ctx.beginPath();ctx.roundRect(-10,-23,20,29,9);ctx.stroke();ctx.beginPath();ctx.roundRect(-10,-5,20,29,9);ctx.stroke();ctx.restore();
  text('nyambung',160,131,62,ink,700);text('.',477,131,62,blue,700);
  line(178);
  const mode = run.mode === 'random' ? 'RANDOM PLAY' : `DAILY #${String(run.number).padStart(3,'0')}`;
  text(mode,76,236,24,blue,600);
  const date = new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${run.date}T12:00:00+07:00`));
  ctx.textAlign='right';text(date,1004,236,24,muted);ctx.textAlign='left';
  text('Skor akhir',76,310,28,muted);
  text(num(run.total),70,455,160,blue,400,'Instrument Serif');
  text('dari 5.000 poin',76,508,28,muted);
  const labels = {bridge2:'Dua kata',bridge3:'Tiga kata',closest:'Dekat makna'};
  run.results.forEach((result,index) => {
    const y = 566 + index * 110;
    line(y);
    text(`0${index+1}`,76,y+61,23,muted,500);
    text(labels[result.kind],132,y+48,27,ink,500);
    text(result.skipped ? 'Dilewati' : `${num(result.score)} dari 1.000`,132,y+80,20,muted);
    const strength = Math.max(0,Math.min(1,result.score/1000));
    const wave = new Path2D(resultWave(index,strength));
    ctx.save();ctx.translate(482,y+32);ctx.scale(1.9,1.55);ctx.lineCap='round';ctx.lineWidth=1.5;ctx.strokeStyle='#dce5f3';ctx.stroke(wave);
    if(strength>0) {ctx.beginPath();ctx.rect(0,0,180*strength,30);ctx.clip();ctx.strokeStyle=blue;ctx.stroke(wave);}
    ctx.restore();ctx.textAlign='right';text(num(result.score),1004,y+66,42,blue,500);ctx.textAlign='left';
  });
  line(1116);
  if(run.demo) text('Mode demo',76,1170,20,muted);
  text('Main di nyambung.web.id',76,1234,29,ink,500);
  ctx.textAlign='right';text('Tanpa petunjuk atau jawaban',1004,1234,20,muted);ctx.textAlign='left';
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Gambar belum bisa dibuat. Coba lagi.')),'image/png'));
  const label = run.mode === 'random' ? `acak-${run.id.slice(0,8)}` : `daily-${String(run.number).padStart(3,'0')}`;
  return new File([blob],`nyambung-${label}-${run.date}.png`,{type:'image/png'});
}

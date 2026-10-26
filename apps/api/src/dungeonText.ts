import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

let glyphs:Promise<Map<string,string>>|undefined;
function loadGlyphs() {
  return glyphs??=(async()=>{
    const built=resolve('apps/web/dist/assets');
    const root=existsSync(resolve(built,'arcade/arcade-labels.png'))?built:resolve('apps/web/public/assets');
    const [charset,pixels]=await Promise.all([
      readFile(resolve(root,'dungeon/dungeon-mode.char'),'utf8'),
      sharp(resolve(root,'arcade/arcade-labels.png')).ensureAlpha().raw().toBuffer(),
    ]);
    const result=new Map<string,string>();
    const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
    charset.split(/\r?\n/).slice(3,19).forEach((row,y)=>{
      Array.from(segmenter.segment(row),part=>part.segment).forEach((char,x)=>{
        let path='';
        for(let j=0;j<8;j++)for(let i=0;i<8;i++){
          const offset=((y*8+j)*128+x*8+i)*4;
          if(pixels[offset]>127&&pixels[offset+3]>127)path+=`M${i} ${j}h1v1h-1z`;
        }
        result.set(char,path);
      });
    });
    result.set('·',result.get('•')!);
    return result;
  })();
}

/** Raster atlas labels are identical across hosts, without installed-font dependencies. */
export async function dungeonText(value:string,left:number,top:number,size:number,color:string,width:number) {
  const atlas=await loadGlyphs();
  const chars=Array.from(value);
  const scale=Math.max(1,Math.min(Math.round(size/8),Math.floor(width/(Math.max(1,chars.length)*8))));
  const paths=chars.map((char,index)=>`<path transform="translate(${index*8} 0)" d="${atlas.get(char)??atlas.get('?')}"/>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1,chars.length)*8*scale}" height="${8*scale}" shape-rendering="crispEdges"><g fill="${color}" transform="scale(${scale})">${paths}</g></svg>`;
  return {input:Buffer.from(svg),left,top};
}

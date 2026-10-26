/** Regenerate the static tube displacement map: node --import tsx scripts/crt-map.ts */
import sharp from 'sharp';
const size=512,pixels=Buffer.alloc(size*size*3);
for(let row=0;row<size;row++)for(let col=0;col<size;col++){
  const x=2*col/(size-1)-1,y=2*row/(size-1)-1,offset=(row*size+col)*3;
  // R/G encode the inverse barrel warp; B is unused.
  pixels[offset]=Math.round((.5+.5*x*y*y)*255);
  pixels[offset+1]=Math.round((.5+.5*y*x*x)*255);
  pixels[offset+2]=128;
}
await sharp(pixels,{raw:{width:size,height:size,channels:3}}).png().toFile('apps/web/public/assets/arcade/crt-barrel.png');

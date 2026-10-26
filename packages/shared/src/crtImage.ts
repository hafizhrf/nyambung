/** Static CRT finish for exported images. Runs once per image, never per UI frame. */
export function crtImage(source:Uint8Array|Uint8ClampedArray,width:number,height:number):Uint8ClampedArray {
  if(width<1||height<1||source.length!==width*height*4)throw new RangeError('Invalid image dimensions');
  const bw=Math.ceil(width/4),bh=Math.ceil(height/4);
  const light=new Float32Array(bw*bh*3),scratch=new Float32Array(light.length),halo=new Float32Array(light.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,b=(Math.floor(y/4)*bw+Math.floor(x/4))*3;
    const gain=Math.max(0,(Math.max(source[p],source[p+1],source[p+2])-45)/210)/16;
    for(let c=0;c<3;c++)light[b+c]+=source[p+c]*gain;
  }
  // Small separable blur on a quarter-resolution light buffer keeps export costs bounded.
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)for(let c=0;c<3;c++){
    let total=0;for(let d=-2;d<=2;d++)total+=light[(y*bw+Math.max(0,Math.min(bw-1,x+d)))*3+c];
    scratch[(y*bw+x)*3+c]=total/5;
  }
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++)for(let c=0;c<3;c++){
    let total=0;for(let d=-2;d<=2;d++)total+=scratch[(Math.max(0,Math.min(bh-1,y+d))*bw+x)*3+c];
    halo[(y*bw+x)*3+c]=total/5;
  }
  const output=new Uint8ClampedArray(source.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const nx=2*x/(width-1||1)-1,ny=2*y/(height-1||1)-1;
    const sx=x+width*.024*nx*ny*ny,sy=y+height*.024*ny*nx*nx;
    const p=(y*width+x)*4;
    if(sx<0||sx>=width-1||sy<0||sy>=height-1){output[p]=8;output[p+1]=9;output[p+2]=13;output[p+3]=255;continue;}
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    const a=(iy*width+ix)*4,b=a+4,d=a+width*4,e=d+4;
    const h=(Math.min(bh-1,Math.floor(sy/4))*bw+Math.min(bw-1,Math.floor(sx/4)))*3;
    const glass=1-.12*Math.pow(nx*nx+ny*ny,2)/4;
    for(let c=0;c<3;c++){
      const base=(source[a+c]*(1-fx)+source[b+c]*fx)*(1-fy)+(source[d+c]*(1-fx)+source[e+c]*fx)*fy;
      const phosphor=(x%4===3?.92:x%4===c?1:.96)*(y%3===2?.84:1);
      output[p+c]=(base+(255-base)*Math.min(1,halo[h+c]/255*.75))*phosphor*glass;
    }
    output[p+3]=255;
  }
  return output;
}

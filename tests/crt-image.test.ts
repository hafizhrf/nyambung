import {describe,it,expect} from 'vitest';
import {crtImage} from '../packages/shared/src/crtImage.js';

describe('exported CRT images',()=>{
  it('adds colored bloom around bright pixels while preserving the dark canvas and opaque output',()=>{
    const width=128,height=128,source=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=(y*width+x)*4,lit=x>=48&&x<80&&y>=48&&y<80;
      source.set(lit?[240,180,70,255]:[8,9,13,255],p);
    }
    const output=crtImage(source,width,height);
    const pixel=(x:number,y:number)=>Array.from(output.slice((y*width+x)*4,(y*width+x)*4+4));
    expect(pixel(83,64)[0]).toBeGreaterThan(12);
    expect(pixel(64,64)[0]).toBeGreaterThan(180);
    expect(pixel(16,64)[0]).toBeLessThan(12);
    expect(pixel(64,65)[0]).toBeLessThan(pixel(64,64)[0]);
    expect(output.length).toBe(source.length);
    expect(Array.from(output).filter((_,index)=>index%4===3).every(alpha=>alpha===255)).toBe(true);
    expect(source[(64*width+83)*4]).toBe(8);
  });
  it('curves a straight edge toward the screen interior near the corners',()=>{
    const width=256,height=256,source=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)source.set(x>=12&&x<16?[255,255,255,255]:[8,9,13,255],(y*width+x)*4);
    const output=crtImage(source,width,height);
    const center=(y:number)=>{
      let sum=0,total=0;
      for(let x=5;x<30;x++){const light=output[(y*width+x)*4];if(light>100){sum+=x*light;total+=light;}}
      return sum/total;
    };
    expect(center(32)-center(128)).toBeGreaterThan(1);
  });
});

import { useEffect, useState } from 'react';
import { platform, type ActivityLayout } from './platform';

export function useActivityLayout(){
  const [layout,setLayout]=useState<ActivityLayout>(platform.layoutMode??'focused');
  const [small,setSmall]=useState(()=>platform.kind==='discord'&&((innerWidth<=420&&innerHeight<=300)||(innerWidth<=280&&innerHeight<=360)));
  useEffect(()=>platform.onLayoutChanged?.(setLayout),[]);
  useEffect(()=>{
    if(platform.kind!=='discord')return;
    let frame=0;
    let fullWidth=innerHeight>400?innerWidth:0;
    const measure=()=>{
      const width=innerWidth,height=innerHeight;
      if(height>400)fullWidth=width;
      const keyboard=matchMedia('(pointer:coarse)').matches&&width>=300&&width===fullWidth;
      setSmall(!keyboard&&((width<=420&&height<=300)||(width<=280&&height<=360)));
    };
    const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    measure();window.addEventListener('resize',resize);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);};
  },[]);
  return platform.kind==='discord'&&(layout==='pip'||layout==='grid'||small);
}

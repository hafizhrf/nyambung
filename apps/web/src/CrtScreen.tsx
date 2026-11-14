import { useEffect } from 'react';

/** CRT light follows Motion preferences; decoration never distorts the page. */
export function CrtScreen() {
  useEffect(()=>{
    const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{
      const moving=root.dataset.crt==='on'&&root.dataset.motion!=='off'&&!media.matches&&!document.hidden;
      root.dataset.crtSignal=moving?'on':'off';
    };
    const observer=new MutationObserver(update);
    observer.observe(root,{attributes:true,attributeFilter:['data-crt','data-motion']});
    media.addEventListener('change',update);document.addEventListener('visibilitychange',update);update();
    return ()=>{observer.disconnect();media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  return <div className="crt-scan-beam" aria-hidden="true"/>;
}

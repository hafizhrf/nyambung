import { useEffect } from 'react';

/** Tube curvature stays static; the rolling light follows CRT and Motion preferences. */
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
  return <><div className="crt-scan-beam" aria-hidden="true"/><svg className="crt-definitions" aria-hidden="true" focusable="false" width="0" height="0">
    <defs><filter id="crt-barrel" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
      <feImage href="/assets/arcade/crt-barrel.png" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="barrel"/>
      <feDisplacementMap in="SourceGraphic" in2="barrel" scale="0.048" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="crt-phosphor" x="-.02" y="-.02" width="1.04" height="1.04" filterUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="halo"/>
      <feComponentTransfer in="halo" result="bloom"><feFuncA type="linear" slope=".65"/></feComponentTransfer>
      <feGaussianBlur in="SourceGraphic" stdDeviation=".45 .3" result="phosphor"/>
      <feMerge><feMergeNode in="bloom"/><feMergeNode in="phosphor"/></feMerge>
    </filter>
    </defs>
  </svg></>;
}

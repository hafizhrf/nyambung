import { useLayoutEffect, useRef } from 'react';

/** Keep a game word intact; fit its actual loaded glyphs to the available width. */
export function FitWord({children}:{children:string}) {
  const ref=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const element=ref.current;if(!element)return;
    let disposed=false;
    const fit=()=>{
      if(disposed)return;
      element.style.fontSize='';
      const base=parseFloat(getComputedStyle(element).fontSize);
      const width=element.clientWidth,natural=element.scrollWidth;
      if(width>0&&natural>width)element.style.fontSize=`${Math.floor(base*width/natural*4)/4}px`;
    };
    const observer=new ResizeObserver(fit);observer.observe(element);fit();
    void document.fonts.ready.then(fit);
    return ()=>{disposed=true;observer.disconnect();};
  },[children]);
  return <strong ref={ref} className="fit-word" title={children}>{children}</strong>;
}

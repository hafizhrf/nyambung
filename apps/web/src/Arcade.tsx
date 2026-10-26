import { useLayoutEffect, useState, type ReactNode, type CSSProperties } from 'react';

// Cell positions in the supplied 16 × 16 Dungeon Mode atlas (8px per glyph).
const glyphs = { link:[15,11], star:[12,11], crt:[10,11], heart:[3,0] } as const;
export function PixelIcon({name}:{name:keyof typeof glyphs}) {
  const [x,y]=glyphs[name];
  return <span className="pixel-icon" aria-hidden="true" style={{'--glyph-x':x,'--glyph-y':y} as CSSProperties}/>;
}
export function ArcadePanel({children,busy}:{children:ReactNode;busy:boolean}) {
  return <div className="game-paper arcade-panel reveal" aria-busy={busy}>{children}</div>;
}
export function ArcadeHud({children}:{children:ReactNode}) {
  return <div className="game-topline arcade-hud reveal">{children}</div>;
}
export function CrtControl() {
  const [enabled,setEnabled]=useState(()=>document.documentElement.dataset.crt!=='off');
  useLayoutEffect(()=>{
    document.documentElement.dataset.crt=enabled?'on':'off';
    try { localStorage.setItem('nyambung-crt',enabled?'on':'off'); } catch { /* Optional in embedded clients. */ }
  },[enabled]);
  return <button className="setting-row crt-button" aria-label="Efek CRT" aria-pressed={enabled} title={`Efek CRT ${enabled?'on':'off'}`} onClick={()=>setEnabled(value=>!value)}><PixelIcon name="crt"/><span>Efek CRT</span><b>{enabled?'ON':'OFF'}</b></button>;
}

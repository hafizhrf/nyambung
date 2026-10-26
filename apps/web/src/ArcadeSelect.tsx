import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Keyboard/touch selector whose popup keeps the arcade type and palette. */
export function ArcadeSelect({ label, value, onValueChange, children }: {
  label: string; value: string | number; onValueChange: (value: string) => void; children: ReactNode;
}) {
  const options = Children.toArray(children).filter(isValidElement).map(child => {
    const props = child.props as { value?: string | number; children: ReactNode };
    return { value: String(props.value ?? props.children), text: props.children };
  });
  const selected = Math.max(0, options.findIndex(option => option.value === String(value)));
  const [open, setOpen] = useState(false), [cursor, setCursor] = useState(selected), [above, setAbove] = useState(false);
  const root = useRef<HTMLSpanElement>(null), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${id}-${cursor}`)?.scrollIntoView({ block: 'nearest' }); }, [cursor, open, id]);
  const show = () => {
    const box = root.current!.getBoundingClientRect();
    const viewportBottom = Math.min(window.visualViewport?.height ?? innerHeight, root.current!.closest('main')?.getBoundingClientRect().bottom ?? innerHeight);
    setAbove(viewportBottom - box.bottom < 210 && box.top > 210);
    setCursor(selected); setOpen(true);
  };
  const choose = (index: number) => { onValueChange(options[index].value); setOpen(false); trigger.current?.focus(); };
  return <span className="arcade-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="arcade-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); show(); }
      }}><span>{options[selected]?.text}</span><span className="select-arrow" aria-hidden="true" /></button>
    {open && <span ref={list} id={id} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={`${id}-${cursor}`} className={`arcade-select-list${above ? ' above' : ''}`}
      onKeyDown={event => {
        if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return; }
        event.preventDefault();
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
        else if (event.key === 'Enter' || event.key === ' ') choose(cursor);
        else if (event.key === 'ArrowDown') setCursor((cursor + 1) % options.length);
        else if (event.key === 'ArrowUp') setCursor((cursor + options.length - 1) % options.length);
        else if (event.key === 'Home') setCursor(0);
        else if (event.key === 'End') setCursor(options.length - 1);
        else if (event.key.length === 1) {
          const match = options.findIndex(option => String(option.text).toLowerCase().startsWith(event.key.toLowerCase()));
          if (match >= 0) setCursor(match);
        }
      }}>
      {options.map((option, index) => <span key={option.value} id={`${id}-${index}`} role="option" aria-selected={selected === index} className={cursor === index ? 'highlighted' : ''}
        onPointerMove={() => setCursor(index)} onClick={event => { event.preventDefault(); choose(index); }}><span aria-hidden="true">{selected === index ? '>' : ''}</span>{option.text}</span>)}
    </span>}
  </span>;
}

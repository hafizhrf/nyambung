import gsap from 'gsap';

/** Keep the focused input mounted while its outline closes into Continue. */
export function morphAnswerInput(field: HTMLElement, caption: string, perfect: boolean): Promise<void> {
  const form = field.closest('form');
  const input = field.querySelector('input');
  const submit = field.querySelector('button');
  const meta = form?.querySelector('.input-meta');
  if (!form || !input || !submit || !meta) return Promise.resolve();

  const probe = document.createElement('button');
  probe.className = 'primary-button next-button';
  probe.textContent = caption;
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  form.parentElement!.append(probe);
  const target = probe.getBoundingClientRect();
  const targetStyle = getComputedStyle(probe);
  const buttonColor = targetStyle.backgroundColor;
  const buttonShadow = targetStyle.boxShadow;
  probe.remove();

  const label = document.createElement('span');
  label.className = 'answer-morph-label';
  label.setAttribute('aria-hidden','true');
  label.textContent = caption;
  const arrow = document.createElementNS('http://www.w3.org/2000/svg','svg');
  arrow.setAttribute('viewBox','0 0 18 18');
  arrow.setAttribute('fill','none');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M3 9h11M10 4l5 5-5 5');
  path.setAttribute('stroke','currentColor');
  path.setAttribute('stroke-width','1.6');
  path.setAttribute('stroke-linecap','round');
  path.setAttribute('stroke-linejoin','round');
  arrow.append(path); label.append(arrow); field.append(label);

  const width = field.getBoundingClientRect().width;
  const height = field.getBoundingClientRect().height;
  const palette = getComputedStyle(document.documentElement);
  const color = perfect ? palette.getPropertyValue('--perfect-button').trim() || '#16a34a' : buttonColor;
  const perfectShadow = palette.getPropertyValue('--perfect-shadow').trim() || '#166534';
  field.dataset.morphing = 'true';
  return new Promise(resolve => {
    gsap.set(field, { width, height, position:'relative', overflow:'hidden', marginInline:'auto', flexShrink:0 });
    gsap.set(label, { opacity:0, y:4 });
    gsap.timeline({ onComplete:resolve })
      .to([input,submit], { opacity:0, duration:.12, ease:'power2.out' }, 0)
      .to(meta, { height:0, marginTop:0, opacity:0, overflow:'hidden', duration:.24, ease:'power3.inOut' }, 0)
      .set([input,submit], { position:'absolute', pointerEvents:'none' }, .12)
      .to(field, { width:Math.min(width,target.width), height:target.height, padding:0, gap:0,
        borderRadius:0, backgroundColor:color, borderColor:color,
        boxShadow:perfect ? `0 3px 0 ${perfectShadow}` : buttonShadow, duration:.42, ease:'power3.inOut' }, .04)
      .to(label, { opacity:1, y:0, duration:.2, ease:'power2.out' }, .24);
  });
}

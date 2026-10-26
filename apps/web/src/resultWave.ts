/** A stable, bounded waveform; each stage gets its own phase and curvature. */
export function resultWave(variant: number, score: number): string {
  const seed = Math.imul(variant + 1, 2654435761) ^ Math.round(score * 1000);
  const unsigned = seed >>> 0;
  const frequency = 1 + (unsigned % 9) * .11;
  const phase = ((unsigned >>> 4) % 17) / 17 * Math.PI * 2;
  const amplitude = 8 + ((unsigned >>> 9) % 5);
  const points = Array.from({length:13}, (_,index) => {
    const t = index / 12;
    const envelope = Math.pow(Math.sin(Math.PI * t), .6);
    const wave = .82 * Math.sin(t * Math.PI * 2 * frequency + phase) + .18 * Math.sin(t * Math.PI * 4 + phase * .7);
    return { x:4 + t * 172, y:15 + amplitude * envelope * wave };
  });
  const fixed = (n: number) => n.toFixed(2);
  const bounded = (n: number) => fixed(Math.max(2,Math.min(28,n)));
  let path = `M${fixed(points[0].x)} ${fixed(points[0].y)}`;
  for(let index=0;index<points.length-1;index++) {
    const previous = points[Math.max(0,index-1)], start = points[index];
    const end = points[index+1], following = points[Math.min(points.length-1,index+2)];
    path += `C${fixed(start.x + (end.x-previous.x)/6)} ${bounded(start.y + (end.y-previous.y)/6)} ${fixed(end.x - (following.x-start.x)/6)} ${bounded(end.y - (following.y-start.y)/6)} ${fixed(end.x)} ${bounded(end.y)}`;
  }
  return path;
}

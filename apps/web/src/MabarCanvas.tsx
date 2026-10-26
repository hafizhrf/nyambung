import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Stroke } from "@nyambung/shared";
export function drawStrokes(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 800, 500);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    stroke.points.forEach(([x, y], n) =>
      n ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
    );
    if (stroke.points.length === 1) {
      ctx.arc(
        stroke.points[0][0],
        stroke.points[0][1],
        stroke.size / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else ctx.stroke();
  }
}
export function DrawingPreview({ strokes }: { strokes: Stroke[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawStrokes(ref.current, strokes);
  }, [strokes]);
  return (
    <canvas
      ref={ref}
      width={800}
      height={500}
      className="drawing-preview"
      aria-label="Gambar rantai"
    />
  );
}
export function MabarCanvas({
  value,
  onChange,
}: {
  value: Stroke[];
  onChange: (v: Stroke[]) => void;
}) {
  const slot = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    current = useRef(value),
    callback = useRef(onChange);
  callback.current = onChange;
  const [color, setColor] = useState("#111111"),
    [size, setSize] = useState(5),
    [box, setBox] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
      clip: string;
    } | null>(null);
  useEffect(() => {
    current.current = value;
    if (canvas.current) drawStrokes(canvas.current, value);
  }, [value]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const b = slot.current?.getBoundingClientRect();
        const viewport = slot.current?.closest("main")?.getBoundingClientRect();
        if (b && viewport)
          setBox({
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            clip: `inset(${Math.max(0, viewport.top - b.top)}px ${Math.max(0, b.right - viewport.right)}px ${Math.max(0, b.bottom - viewport.bottom)}px ${Math.max(0, viewport.left - b.left)}px)`,
          });
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (slot.current) observer.observe(slot.current);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    if (canvas.current) drawStrokes(canvas.current, current.current);
  }, [box]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (drawing.current) callback.current([...current.current]);
    }, 500);
    return () => clearInterval(timer);
  }, []);
  const point = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ): [number, number] => {
    const b = event.currentTarget.getBoundingClientRect();
    return [
      Math.round(
        Math.max(0, Math.min(800, ((event.clientX - b.left) / b.width) * 800)),
      ),
      Math.round(
        Math.max(0, Math.min(500, ((event.clientY - b.top) / b.height) * 500)),
      ),
    ];
  };
  const change = (next: Stroke[]) => {
    current.current = next;
    callback.current(next);
    if (canvas.current) drawStrokes(canvas.current, next);
  };
  return (
    <>
      <div className="draw-tools">
        <label>
          Warna{" "}
          <select value={color} onChange={(e) => setColor(e.target.value)}>
            {[
              "#111111",
              "#ffffff",
              "#e34646",
              "#facb4b",
              "#54b95a",
              "#368ed6",
              "#a86cdf",
            ].map((c) => (
              <option value={c} key={c}>
                {
                  (
                    {
                      "#111111": "Hitam",
                      "#ffffff": "Penghapus",
                      "#e34646": "Merah",
                      "#facb4b": "Kuning",
                      "#54b95a": "Hijau",
                      "#368ed6": "Biru",
                      "#a86cdf": "Ungu",
                    } as Record<string, string>
                  )[c]
                }
              </option>
            ))}
          </select>
        </label>
        <label>
          Ukuran{" "}
          <select value={size} onChange={(e) => setSize(+e.target.value)}>
            {[3, 5, 10, 20, 32].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button onClick={() => change(current.current.slice(0, -1))}>
          Undo
        </button>
        <button onClick={() => change([])}>Hapus</button>
      </div>
      <div ref={slot} className="canvas-slot" />
      {box &&
        box.width > 0 &&
        createPortal(
          <canvas
            ref={canvas}
            width={800}
            height={500}
            aria-label="Kanvas gambar"
            style={{
              position: "fixed",
              clipPath: box.clip,
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              zIndex: 15,
              touchAction: "none",
              background: "#fff",
            }}
            onPointerDown={(e) => {
              if (current.current.length >= 300) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              change([...current.current, { color, size, points: [point(e)] }]);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const last = current.current.at(-1)!;
              if (last.points.length >= 2000) return;
              if (
                current.current.reduce((n, s) => n + s.points.length, 0) >= 6000
              )
                return;
              last.points.push(point(e));
              if (canvas.current) drawStrokes(canvas.current, current.current);
            }}
            onPointerUp={() => {
              drawing.current = false;
              callback.current([...current.current]);
            }}
            onPointerCancel={() => {
              drawing.current = false;
              callback.current([...current.current]);
            }}
          />,
          document.body,
        )}
    </>
  );
}

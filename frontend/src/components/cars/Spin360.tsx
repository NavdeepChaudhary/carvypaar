"use client";

import { Move3d, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { ListingImage } from "@/lib/types";

import { CarImage } from "./CarImage";

const PX_PER_FRAME = 40; // drag distance that advances one frame

/**
 * 360° viewer. Drag (or use the arrow keys) to spin through the car's photos as
 * frames. With an ordered walk-around photo set (8 to 36 shots) this gives a true
 * 360° spin; with a normal gallery it works as a quick swipe-through preview.
 * Swapping in a dedicated spin-set or WebGL viewer later only needs this component.
 */
export function Spin360({ images, title }: { images: ListingImage[]; title: string }) {
  const [frame, setFrame] = useState(0);
  const [hinted, setHinted] = useState(false);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const n = images.length;

  // Preload every frame so spinning doesn't flash.
  useEffect(() => {
    images.forEach((img) => {
      const pre = new Image();
      pre.src = img.url;
    });
  }, [images]);

  // A one-time auto-spin shows the viewer is interactive.
  useEffect(() => {
    if (hinted || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setFrame(i % n);
      if (i >= n) {
        window.clearInterval(id);
        setHinted(true);
        setFrame(0);
      }
    }, 220);
    return () => window.clearInterval(id);
  }, [hinted, n]);

  const step = (delta: number) => setFrame((f) => (((f + delta) % n) + n) % n);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setHinted(true);
    drag.current = { x: e.clientX, start: frame };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const moved = Math.round((e.clientX - drag.current.x) / PX_PER_FRAME);
    setFrame((((drag.current.start - moved) % n) + n) % n);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHinted(true); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setHinted(true); step(-1); }
  };

  if (n === 0) return <CarImage src={null} alt={title} className="aspect-[16/10] w-full rounded-3xl" />;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`360° view of ${title}. Use left and right arrow keys to rotate.`}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={frame + 1}
      aria-valuetext={`Angle ${frame + 1} of ${n}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKey}
      className="group relative aspect-[16/10] cursor-grab touch-pan-y select-none overflow-hidden rounded-3xl bg-elevated active:cursor-grabbing"
    >
      {images.map((img, i) => (
        <CarImage key={img.id} src={img.url} alt="" eager
          className={`pointer-events-none absolute inset-0 h-full w-full ${i === frame ? "opacity-100" : "opacity-0"}`} />
      ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <Move3d className="h-4 w-4" aria-hidden /> Drag to spin
        </span>
        {/* angle indicator */}
        <span className="flex items-center gap-2 text-xs tabular-nums">
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          {Math.round((frame / n) * 360)}°
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-6 bottom-12 h-1 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${((frame + 1) / n) * 100}%` }} />
      </div>
    </div>
  );
}

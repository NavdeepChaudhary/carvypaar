"use client";

import { ChevronLeft, ChevronRight, Star, Trash2 } from "lucide-react";

import { CarImage } from "./CarImage";

/** One photo in a manager grid, with move/delete controls. Index 0 is the cover. */
export function PhotoTile({
  src,
  index,
  count,
  onMove,
  onDelete,
  disabled,
}: {
  src: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const ctrl =
    "grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-on-accent backdrop-blur transition hover:bg-accent disabled:opacity-30 disabled:hover:bg-black/60";
  return (
    <li className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-line">
      <CarImage src={src} alt={`Photo ${index + 1}`} className="h-full w-full" />
      {index === 0 && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent">
          <Star className="h-3 w-3 fill-current" aria-hidden /> Cover
        </span>
      )}
      <div className="absolute inset-x-2 bottom-2 flex justify-between">
        <div className="flex gap-1">
          <button type="button" className={ctrl} disabled={disabled || index === 0}
            onClick={() => onMove(index, index - 1)} aria-label={`Move photo ${index + 1} earlier`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={ctrl} disabled={disabled || index === count - 1}
            onClick={() => onMove(index, index + 1)} aria-label={`Move photo ${index + 1} later`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button type="button" className={ctrl} disabled={disabled} onClick={onDelete} aria-label={`Delete photo ${index + 1}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

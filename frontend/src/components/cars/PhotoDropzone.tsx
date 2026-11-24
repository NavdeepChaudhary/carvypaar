"use client";

import { clsx } from "clsx";
import { ImagePlus } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_MB } from "@/lib/constants";

/** Drag-and-drop / click-to-browse target. */
export function PhotoDropzone({
  onFiles,
  disabled,
  remaining,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  remaining: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={clsx(
        "rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
        over ? "border-accent bg-accent/10" : "border-line",
        disabled && "opacity-50",
      )}
    >
      <ImagePlus className="mx-auto h-10 w-10 text-ink" aria-hidden />
      <p className="mt-3 font-semibold">Drag photos here</p>
      <p className="mt-1 text-xs text-muted">
        JPEG, PNG or WebP · up to {MAX_UPLOAD_MB} MB each · {remaining} slot{remaining === 1 ? "" : "s"} left
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:border-accent hover:text-ink disabled:pointer-events-none"
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose photos"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
    </div>
  );
}

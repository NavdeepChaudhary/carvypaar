"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { ListingImage } from "@/lib/types";

import { CarImage } from "./CarImage";

/** Large gallery with thumbnails, swipe/keyboard navigation and a fullscreen lightbox. */
export function Gallery({ images, title }: { images: ListingImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const count = images.length;

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setDirection(delta);
      setIndex((i) => (i + delta + count) % count);
    },
    [count],
  );

  // Keyboard: arrows navigate, Escape closes the lightbox.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setLightbox(false);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [lightbox, go]);

  if (count === 0) {
    return <CarImage src={null} alt={title} className="aspect-[16/10] w-full rounded-3xl" />;
  }

  const current = images[index];
  const slide = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  const arrows = (big = false) =>
    count > 1 && (
      <>
        {[-1, 1].map((d) => (
          <button
            key={d}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(d);
            }}
            aria-label={d < 0 ? "Previous photo" : "Next photo"}
            className={clsx(
              "absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/50 text-on-accent backdrop-blur transition hover:border-accent hover:bg-accent",
              big ? "h-14 w-14" : "h-11 w-11 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              d < 0 ? (big ? "left-4" : "left-3") : big ? "right-4" : "right-3",
            )}
          >
            {d < 0 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        ))}
      </>
    );

  return (
    <div>
      <div className="group relative aspect-[16/10] overflow-hidden rounded-3xl bg-elevated">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={current.id}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            drag={count > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(1);
              else if (info.offset.x > 60) go(-1);
            }}
            className="absolute inset-0 cursor-zoom-in"
            onClick={() => setLightbox(true)}
          >
            <CarImage src={current.url} alt={`${title}, photo ${index + 1} of ${count}`} className="h-full w-full" eager />
          </motion.div>
        </AnimatePresence>
        {arrows()}
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-semibold text-on-accent backdrop-blur hover:bg-accent"
        >
          <Expand className="h-3.5 w-3.5" aria-hidden /> {index + 1} / {count}
        </button>
      </div>

      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Photos">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show photo ${i + 1}`}
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              className={clsx(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-all sm:h-20 sm:w-28",
                i === index ? "border-accent shadow-glow" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <CarImage src={img.url} alt="" className="h-full w-full" />
            </button>
          ))}
        </div>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {lightbox && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={`${title} photos`}
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setLightbox(false)}
              >
                <button
                  type="button"
                  onClick={() => setLightbox(false)}
                  className="absolute right-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-on-accent hover:bg-accent"
                  aria-label="Close photos"
                  autoFocus
                >
                  <X className="h-6 w-6" />
                </button>
                <AnimatePresence initial={false} custom={direction} mode="popLayout">
                  <motion.div
                    key={current.id}
                    custom={direction}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.3 }}
                    className="max-h-[85vh] max-w-[92vw]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CarImage src={current.url} alt={`${title}, photo ${index + 1}`} className="max-h-[85vh] w-auto rounded-xl object-contain" eager />
                  </motion.div>
                </AnimatePresence>
                {arrows(true)}
                <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-white/70" aria-live="polite">
                  {index + 1} / {count}
                </p>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

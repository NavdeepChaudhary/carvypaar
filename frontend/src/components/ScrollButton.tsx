"use client";

import { clsx } from "clsx";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** How close to the bottom (px) counts as "at the bottom", where the arrow flips up. */
const BOTTOM_ZONE = 120;
/** Going down is a slow, steady glide; going back up is quicker. */
const DOWN_PX_PER_SEC = 900;
const UP_PX_PER_SEC = 3000;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * A round, bouncing button in the bottom-right corner.
 * - Arrow points down: click glides slowly to the bottom of the page.
 * - At the bottom the arrow turns up: click goes back to the top.
 * Any wheel, touch or key press stops the glide, so the visitor stays in control.
 */
export function ScrollButton() {
  const [atBottom, setAtBottom] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const frame = useRef<number | null>(null);

  const update = useCallback(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    setScrollable(max > 200);
    setAtBottom(window.scrollY >= max - BOTTOM_ZONE);
  }, []);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    update();
    const interrupt = () => stop();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", interrupt);
    // Pages grow as content loads (listings, images), so re-check the height.
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      stop();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", interrupt);
      observer.disconnect();
    };
  }, [update, stop]);

  const glideTo = (target: number, pxPerSec: number) => {
    stop();
    const start = window.scrollY;
    const distance = target - start;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, target);
      return;
    }
    const duration = Math.min(8000, Math.max(600, (Math.abs(distance) / pxPerSec) * 1000));
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, start + distance * easeInOut(t));
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  };

  const onClick = () => {
    if (atBottom) {
      glideTo(0, UP_PX_PER_SEC);
    } else {
      glideTo(document.documentElement.scrollHeight - window.innerHeight, DOWN_PX_PER_SEC);
    }
  };

  if (!scrollable) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={atBottom ? "Back to top" : "Scroll down"}
      title={atBottom ? "Back to top" : "Scroll down"}
      className={clsx(
        "fixed bottom-5 right-5 z-[60] grid h-12 w-12 place-items-center rounded-full sm:bottom-8 sm:right-8 sm:h-14 sm:w-14",
        "bg-accent text-on-accent shadow-[0_8px_24px_rgba(255,193,7,0.45)] ring-4 ring-accent/25",
        "transition-shadow hover:shadow-[0_10px_30px_rgba(255,193,7,0.65)] focus-visible:outline-none focus-visible:ring-on-accent",
        "motion-safe:animate-bounce hover:[animation-play-state:paused]",
      )}
    >
      <ArrowDown
        className={clsx("h-6 w-6 transition-transform duration-500", atBottom && "rotate-180")}
        strokeWidth={2.75}
        aria-hidden
      />
    </button>
  );
}

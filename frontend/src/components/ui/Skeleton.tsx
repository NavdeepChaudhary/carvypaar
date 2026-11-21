import { clsx } from "clsx";

/** Shimmering placeholder block shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={clsx("relative overflow-hidden rounded-lg bg-elevated", className)}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-fg/5 to-transparent" />
    </div>
  );
}

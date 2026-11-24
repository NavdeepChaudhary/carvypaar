import { clsx } from "clsx";
import { CarFront } from "lucide-react";
import Link from "next/link";

/** Brand mark. `inverted` for dark (navy) backgrounds like the footer. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="CarvyPaar home">
      <span
        className={clsx(
          "grid h-10 w-10 place-items-center rounded-xl border-2 border-accent transition-transform group-hover:-rotate-6",
          inverted ? "text-accent" : "text-ink dark:text-accent",
        )}
      >
        <CarFront className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span className={clsx("font-display text-xl font-extrabold tracking-tight", inverted ? "text-white" : "text-fg")}>
          Carvy<span className="text-accent">Paar</span>
        </span>
        <span className={clsx("mt-1 text-[10px] font-semibold uppercase tracking-[0.25em]", inverted ? "text-white/60" : "text-muted")}>
          Buy · Sell · Bid
        </span>
      </span>
    </Link>
  );
}

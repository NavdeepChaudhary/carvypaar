import { clsx } from "clsx";
import { Sparkles } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { RATING_STYLES } from "@/lib/price";
import type { PriceRating } from "@/lib/types";

/** "Great deal / Fair price / Overpriced" pill. The AI estimate appears in the tooltip and to screen readers. */
export function PriceBadge({
  rating,
  estimate,
  size = "sm",
  className,
}: {
  rating: PriceRating;
  estimate?: number | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const style = RATING_STYLES[rating];
  const title = estimate ? `${style.hint}. AI estimate: ${formatPrice(estimate)}` : style.hint;
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider backdrop-blur",
        size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs",
        style.className,
        className,
      )}
    >
      <Sparkles className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {style.label}
      <span className="sr-only">. {title}</span>
    </span>
  );
}

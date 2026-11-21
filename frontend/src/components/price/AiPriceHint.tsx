"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { formatPrice, formatPriceShort } from "@/lib/format";
import { priceApi } from "@/lib/price";
import type { PricePrediction, PricePredictRequest } from "@/lib/types";

/**
 * Live AI suggestion under the price field on the sell/edit form. Waits until the
 * car is fully described, debounces typing, and cancels stale requests.
 */
export function AiPriceHint({
  request,
  onUse,
}: {
  request: PricePredictRequest | null;
  onUse: (price: number) => void;
}) {
  const [result, setResult] = useState<PricePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const key = request ? JSON.stringify(request) : "";

  useEffect(() => {
    if (!request) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      priceApi
        .predict(request, controller.signal)
        .then(setResult)
        .catch(() => !controller.signal.aborted && setResult(null)) // model missing etc.: stay quiet
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `key` captures every field of `request`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!request) return <span>Fill in the car details to get an AI price suggestion</span>;
  if (loading && !result) {
    return (
      <span className="flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Asking our AI…
      </span>
    );
  }
  if (!result) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-live="polite">
      <Sparkles className="h-3 w-3 text-neon" aria-hidden />
      <span>
        AI suggests <strong className="text-fg">{formatPrice(result.estimated_price)}</strong>{" "}
        ({formatPriceShort(result.low)} – {formatPriceShort(result.high)})
      </span>
      <button type="button" onClick={() => onUse(result.estimated_price)} className="font-semibold text-accent hover:underline">
        Use this price
      </button>
    </span>
  );
}

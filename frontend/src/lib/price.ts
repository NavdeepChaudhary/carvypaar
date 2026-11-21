import { apiFetch } from "./api";
import type { ModelInfo, PricePrediction, PricePredictRequest, PriceRating } from "./types";

export const priceApi = {
  predict: (data: PricePredictRequest, signal?: AbortSignal) =>
    apiFetch<PricePrediction>("/api/predict-price", { method: "POST", body: data, auth: false, signal }),
  model: () => apiFetch<ModelInfo>("/api/predict-price/model", { auth: false }),
};

export const RATING_STYLES: Record<PriceRating, { label: string; className: string; hint: string }> = {
  great_deal: {
    label: "Great deal",
    className: "bg-emerald-500/90 text-white shadow-[0_0_14px_rgba(16,185,129,0.55)]",
    hint: "Priced well below what our AI expects for this car",
  },
  fair: {
    label: "Fair price",
    className: "bg-neon/85 text-black shadow-glow-cyan",
    hint: "In line with what our AI expects for this car",
  },
  overpriced: {
    label: "Overpriced",
    className: "bg-amber-500/90 text-black shadow-[0_0_14px_rgba(245,158,11,0.5)]",
    hint: "Priced above what our AI expects for this car",
  },
};

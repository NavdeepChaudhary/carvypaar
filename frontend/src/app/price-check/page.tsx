"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Gauge, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FactorList } from "@/components/price/FactorList";
import { PriceBadge } from "@/components/price/PriceBadge";
import { Speedometer } from "@/components/price/Speedometer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ApiError, DEMO_MESSAGE, STATIC_DEMO } from "@/lib/api";
import { BODY_OPTIONS, CONDITION_OPTIONS, FUEL_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/constants";
import { formatNumber, formatPrice } from "@/lib/format";
import { listingsApi } from "@/lib/listings";
import { priceApi } from "@/lib/price";
import type { MakeModels, ModelInfo, PricePrediction, PricePredictRequest } from "@/lib/types";

type Form = Record<keyof Omit<PricePredictRequest, "asking_price">, string> & { asking_price: string };
const EMPTY: Form = {
  make: "", model: "", year: "", mileage: "", fuel_type: "", transmission: "", body_type: "", condition: "", location: "", asking_price: "",
};
const CONFIDENCE = {
  high: { label: "High confidence", className: "text-emerald-400" },
  medium: { label: "Medium confidence", className: "text-amber-400" },
  low: { label: "Low confidence", className: "text-accent" },
} as const;

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const maxYear = new Date().getFullYear() + 1;
  if (!f.make.trim()) e.make = "Required";
  if (!f.model.trim()) e.model = "Required";
  const y = Number(f.year);
  if (!Number.isInteger(y) || y < 1990 || y > maxYear) e.year = `1990 – ${maxYear}`;
  const km = Number(f.mileage);
  if (f.mileage === "" || !Number.isInteger(km) || km < 0 || km > 2_000_000) e.mileage = "Enter km driven";
  (["fuel_type", "transmission", "body_type", "condition"] as const).forEach((k) => { if (!f[k]) e[k] = "Required"; });
  if (f.location.trim().length < 2) e.location = "Required";
  if (f.asking_price && !(Number(f.asking_price) > 0)) e.asking_price = "Enter a valid price";
  return e;
}

export default function PriceCheckPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [result, setResult] = useState<PricePrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [makes, setMakes] = useState<MakeModels[]>([]);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const makeList = useId();
  const modelList = useId();

  useEffect(() => {
    listingsApi.makes().then(setMakes).catch(() => undefined);
    priceApi.model().then(setInfo).catch(() => setInfo({ available: false }));
  }, []);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const res = await priceApi.predict({
        make: form.make.trim(), model: form.model.trim(), year: Number(form.year), mileage: Number(form.mileage),
        fuel_type: form.fuel_type as PricePredictRequest["fuel_type"],
        transmission: form.transmission as PricePredictRequest["transmission"],
        body_type: form.body_type as PricePredictRequest["body_type"],
        condition: form.condition as PricePredictRequest["condition"],
        location: form.location.trim(),
        asking_price: form.asking_price ? Math.round(Number(form.asking_price)) : undefined,
      });
      setResult(res);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't estimate this car");
    } finally {
      setLoading(false);
    }
  };

  const models = makes.find((m) => m.make.toLowerCase() === form.make.trim().toLowerCase())?.models ?? [];
  const metrics = info?.metrics;

  return (
    <div className="container-page pb-20 pt-28">
      <header className="relative overflow-hidden rounded-3xl border border-line/60 bg-gradient-to-br from-neon/15 via-surface to-accent/15 p-8 sm:p-12">
        <div className="absolute -left-12 -top-12 h-56 w-56 rounded-full bg-neon/20 blur-3xl" aria-hidden />
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-neon">
          <Sparkles className="h-4 w-4" aria-hidden /> AI price predictor
        </p>
        <h1 className="relative mt-3 font-display text-3xl font-black uppercase sm:text-5xl">What&apos;s my car worth?</h1>
        <p className="relative mt-3 max-w-xl text-sm text-muted sm:text-base">
          Get an instant market estimate with a realistic price range, and see exactly what pushes your car&apos;s value up or down.
        </p>
      </header>

      {info && !info.available && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          {STATIC_DEMO ? DEMO_MESSAGE : (
            <>The price model isn&apos;t trained yet. Run <code className="rounded bg-black/30 px-1.5">python ml/scripts/train.py</code> and refresh.</>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_440px]">
        <form onSubmit={onSubmit} noValidate className="glass space-y-5 rounded-2xl p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Make" list={makeList} autoComplete="off" placeholder="Hyundai" maxLength={60} value={form.make} error={errors.make} onChange={set("make")} />
            <datalist id={makeList}>{makes.map((m) => <option key={m.make} value={m.make} />)}</datalist>
            <Input label="Model" list={modelList} autoComplete="off" placeholder="Creta" maxLength={60} value={form.model} error={errors.model} onChange={set("model")} />
            <datalist id={modelList}>{models.map((m) => <option key={m} value={m} />)}</datalist>
            <Input label="Year" type="number" inputMode="numeric" placeholder="2021" value={form.year} error={errors.year} onChange={set("year")} />
            <Input label="Kilometres driven" type="number" inputMode="numeric" min={0} placeholder="35000" value={form.mileage} error={errors.mileage} onChange={set("mileage")} />
            <Select label="Fuel" placeholder="Select" options={FUEL_OPTIONS} value={form.fuel_type} error={errors.fuel_type} onChange={set("fuel_type")} />
            <Select label="Transmission" placeholder="Select" options={TRANSMISSION_OPTIONS} value={form.transmission} error={errors.transmission} onChange={set("transmission")} />
            <Select label="Body type" placeholder="Select" options={BODY_OPTIONS} value={form.body_type} error={errors.body_type} onChange={set("body_type")} />
            <Select label="Condition" placeholder="Select" options={CONDITION_OPTIONS} value={form.condition} error={errors.condition} onChange={set("condition")} />
            <Input label="City" placeholder="Pune" maxLength={120} value={form.location} error={errors.location} onChange={set("location")} />
            <Input label="Asking price (optional)" type="number" inputMode="numeric" min={1} placeholder="Compare a listing"
              value={form.asking_price} error={errors.asking_price} onChange={set("asking_price")}
              hint="We'll tell you if it's a great deal, fair, or overpriced" />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={info?.available === false}>
            <Gauge className="h-5 w-5" aria-hidden /> Estimate value
          </Button>
        </form>

        <div ref={resultRef} className="scroll-mt-28 space-y-6" aria-live="polite">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div key={`${result.estimated_price}-${result.model_version}-${result.deal?.asking_price ?? 0}`}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="glass rounded-2xl p-6">
                  <Speedometer value={result.estimated_price} low={result.low} high={result.high} marker={result.deal?.asking_price} />
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
                    <span className={clsx("font-semibold", CONFIDENCE[result.confidence].className)}>{CONFIDENCE[result.confidence].label}</span>
                    <span className="text-muted">· {Math.round(result.interval * 100)}% of similar cars sell in this range</span>
                  </div>
                  {result.unseen.length > 0 && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-300">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      Our model hasn&apos;t seen this {result.unseen.join(" / ")} before, so treat this estimate as a rough guide.
                    </p>
                  )}
                  {result.deal && (
                    <div className="mt-5 flex flex-col items-center gap-2 border-t border-line/60 pt-5 text-center">
                      <PriceBadge rating={result.deal.rating} size="md" />
                      <p className="text-sm">
                        Asking {formatPrice(result.deal.asking_price)} is{" "}
                        <span className="font-semibold">{Math.abs(result.deal.delta_pct).toFixed(0)}% {result.deal.delta_pct < 0 ? "below" : "above"}</span>{" "}
                        our estimate.
                      </p>
                    </div>
                  )}
                </div>
                <div className="glass rounded-2xl p-6">
                  <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide">What drives this price</h2>
                  <FactorList factors={result.factors} />
                </div>
                <Link href="/sell" className="block rounded-2xl border border-accent/40 bg-accent/10 p-5 text-center font-semibold text-accent hover:bg-accent hover:text-white">
                  Ready to sell? List it at {formatPrice(result.estimated_price)} →
                </Link>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="glass flex flex-col items-center rounded-2xl p-10 text-center">
                <Gauge className="h-14 w-14 text-neon/60" aria-hidden />
                <p className="mt-4 font-display font-bold uppercase tracking-wide">Your estimate appears here</p>
                <p className="mt-2 text-sm text-muted">Fill in the details and hit Estimate value.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {metrics && (
            <details className="glass rounded-2xl p-5 text-sm">
              <summary className="cursor-pointer font-semibold">How accurate is this?</summary>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-muted">Typical error (MAPE)</dt><dd className="font-display text-lg font-bold">{(metrics.mape * 100).toFixed(1)}%</dd></div>
                <div><dt className="text-muted">R² on unseen cars</dt><dd className="font-display text-lg font-bold">{metrics.r2.toFixed(3)}</dd></div>
                <div><dt className="text-muted">Mean absolute error</dt><dd className="font-display text-lg font-bold">{formatPrice(metrics.mae)}</dd></div>
                <div><dt className="text-muted">Range coverage</dt><dd className="font-display text-lg font-bold">{(metrics.interval_coverage * 100).toFixed(0)}%</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                Gradient-boosted trees trained on {formatNumber(info?.rows ?? 0)} cars
                ({Object.keys(info?.sources ?? {}).join(", ")}), measured on a held-out test set.
                {info?.sources && Object.keys(info.sources).length === 1 && "synthetic" in info.sources &&
                  " This build uses synthetic market data only, so real-world accuracy will be lower."}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

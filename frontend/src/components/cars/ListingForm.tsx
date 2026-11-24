"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { AiPriceHint } from "@/components/price/AiPriceHint";
import { Button } from "@/components/ui/Button";
import { Input, TextArea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { BODY_OPTIONS, CONDITION_OPTIONS, FUEL_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { listingsApi } from "@/lib/listings";
import type { ListingInput, MakeModels, PricePredictRequest } from "@/lib/types";

/** Form state keeps numbers as strings so inputs can be empty while typing. */
interface FormState {
  title: string;
  make: string;
  model: string;
  year: string;
  mileage: string;
  fuel_type: string;
  transmission: string;
  body_type: string;
  condition: string;
  color: string;
  location: string;
  price: string;
  description: string;
  features: string[];
}

type Errors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  title: "", make: "", model: "", year: "", mileage: "", fuel_type: "", transmission: "",
  body_type: "", condition: "", color: "", location: "", price: "", description: "", features: [],
};

export const FEATURE_SUGGESTIONS = [
  "Sunroof", "Apple CarPlay", "Android Auto", "360° camera", "Cruise control", "Leather seats",
  "Ventilated seats", "Alloy wheels", "LED headlamps", "ADAS", "Keyless entry", "Full service history",
];

function fromListing(input?: Partial<ListingInput>): FormState {
  if (!input) return EMPTY;
  return {
    ...EMPTY,
    ...Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v : v === undefined || v === null ? "" : String(v)]),
    ),
  } as FormState;
}

export function validateListing(f: FormState): Errors {
  const e: Errors = {};
  const year = Number(f.year);
  const maxYear = new Date().getFullYear() + 1;
  if (f.title.trim().length < 5) e.title = "At least 5 characters";
  if (!f.make.trim()) e.make = "Required";
  if (!f.model.trim()) e.model = "Required";
  if (!Number.isInteger(year) || year < 1886 || year > maxYear) e.year = `Between 1886 and ${maxYear}`;
  const km = Number(f.mileage);
  if (f.mileage === "" || !Number.isInteger(km) || km < 0 || km > 2_000_000) e.mileage = "0 to 20,00,000 km";
  if (!f.fuel_type) e.fuel_type = "Required";
  if (!f.transmission) e.transmission = "Required";
  if (!f.body_type) e.body_type = "Required";
  if (!f.condition) e.condition = "Required";
  if (!f.color.trim()) e.color = "Required";
  if (f.location.trim().length < 2) e.location = "Required";
  const price = Number(f.price);
  if (!(price > 0) || price > 1e9) e.price = "Enter a valid price";
  return e;
}

function toInput(f: FormState): ListingInput {
  return {
    title: f.title.trim(),
    make: f.make.trim(),
    model: f.model.trim(),
    year: Number(f.year),
    mileage: Number(f.mileage),
    fuel_type: f.fuel_type as ListingInput["fuel_type"],
    transmission: f.transmission as ListingInput["transmission"],
    body_type: f.body_type as ListingInput["body_type"],
    condition: f.condition as ListingInput["condition"],
    color: f.color.trim(),
    location: f.location.trim(),
    price: Math.round(Number(f.price)),
    description: f.description.trim(),
    features: f.features,
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="glass space-y-5 rounded-2xl p-6">
      <legend className="sr-only">{title}</legend>
      <h2 aria-hidden className="font-display text-lg font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </fieldset>
  );
}

interface ListingFormProps {
  initial?: Partial<ListingInput>;
  submitLabel: string;
  /** Rendered between the form sections and the submit button (e.g. photos). */
  extra?: ReactNode;
  /** Label for the price field (e.g. "Starting bid (₹)" for auctions). */
  priceLabel?: string;
  /** Lets the parent read the price as it's typed (auction settings use it). */
  onPriceChange?: (price: number) => void;
  /** Extra validation run before submit; return false to block it. */
  beforeSubmit?: (data: ListingInput) => boolean;
  onSubmit: (data: ListingInput) => Promise<void>;
}

export function ListingForm({ initial, submitLabel, extra, priceLabel, onPriceChange, beforeSubmit, onSubmit }: ListingFormProps) {
  const [form, setForm] = useState<FormState>(() => fromListing(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [featureDraft, setFeatureDraft] = useState("");
  const [makes, setMakes] = useState<MakeModels[]>([]);
  const makeListId = useId();
  const modelListId = useId();

  useEffect(() => {
    listingsApi.makes().then(setMakes).catch(() => setMakes([]));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const bind = (key: Exclude<keyof FormState, "features">) => ({
    value: form[key],
    error: errors[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  const addFeature = (raw: string) => {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 50);
    if (!value || form.features.length >= 30) return;
    if (form.features.some((f) => f.toLowerCase() === value.toLowerCase())) return;
    set("features", [...form.features, value]);
    setFeatureDraft("");
  };
  const onFeatureKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFeature(featureDraft);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateListing(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const data = toInput(form);
    if (beforeSubmit && !beforeSubmit(data)) return;
    setSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    onPriceChange?.(Number(form.price) || 0);
  }, [form.price, onPriceChange]);

  const modelSuggestions = makes.find((m) => m.make.toLowerCase() === form.make.trim().toLowerCase())?.models ?? [];
  const price = Number(form.price);

  // Ask the AI for a price only once the car is fully described.
  const aiRequest = useMemo<PricePredictRequest | null>(() => {
    const year = Number(form.year);
    const km = Number(form.mileage);
    const complete = form.make.trim() && form.model.trim() && Number.isInteger(year) && year >= 1990
      && year <= new Date().getFullYear() + 1 && form.mileage !== "" && Number.isInteger(km) && km >= 0
      && form.fuel_type && form.transmission && form.body_type && form.condition && form.location.trim().length >= 2;
    if (!complete) return null;
    return {
      make: form.make.trim(), model: form.model.trim(), year, mileage: km,
      fuel_type: form.fuel_type as PricePredictRequest["fuel_type"],
      transmission: form.transmission as PricePredictRequest["transmission"],
      body_type: form.body_type as PricePredictRequest["body_type"],
      condition: form.condition as PricePredictRequest["condition"],
      location: form.location.trim(),
    };
  }, [form.make, form.model, form.year, form.mileage, form.fuel_type, form.transmission, form.body_type, form.condition, form.location]);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Section title="The basics">
        <Input label="Listing title" placeholder="2021 BMW M340i xDrive, single owner" maxLength={150} {...bind("title")} />
        <div className="grid gap-5 sm:grid-cols-3">
          <Input label="Make" list={makeListId} placeholder="BMW" maxLength={60} autoComplete="off" {...bind("make")} />
          <datalist id={makeListId}>{makes.map((m) => <option key={m.make} value={m.make} />)}</datalist>
          <Input label="Model" list={modelListId} placeholder="M340i" maxLength={60} autoComplete="off" {...bind("model")} />
          <datalist id={modelListId}>{modelSuggestions.map((m) => <option key={m} value={m} />)}</datalist>
          <Input label="Year" type="number" inputMode="numeric" placeholder={String(new Date().getFullYear())} {...bind("year")} />
        </div>
      </Section>

      <Section title="Specs">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Mileage (km)" type="number" inputMode="numeric" min={0} placeholder="24000" {...bind("mileage")} />
          <Input label="Color" placeholder="Portimao Blue" maxLength={40} {...bind("color")} />
          <Select label="Fuel" placeholder="Select fuel" options={FUEL_OPTIONS} {...bind("fuel_type")} />
          <Select label="Transmission" placeholder="Select transmission" options={TRANSMISSION_OPTIONS} {...bind("transmission")} />
          <Select label="Body type" placeholder="Select body type" options={BODY_OPTIONS} {...bind("body_type")} />
          <Select label="Condition" placeholder="Select condition" options={CONDITION_OPTIONS} {...bind("condition")} />
        </div>
      </Section>

      <Section title="Price & location">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={priceLabel ?? "Asking price (₹)"}
            type="number"
            inputMode="numeric"
            min={1}
            step={1000}
            placeholder="5800000"
            hint={
              <div className="space-y-1">
                {price > 0 && <div>{formatPrice(price)}</div>}
                <AiPriceHint request={aiRequest} onUse={(p) => set("price", String(p))} />
              </div>
            }
            {...bind("price")}
          />
          <Input label="Location" placeholder="Mumbai" maxLength={120} autoComplete="address-level2" {...bind("location")} />
        </div>
      </Section>

      <Section title="Description & features">
        <TextArea
          label="Description"
          rows={6}
          maxLength={5000}
          placeholder="Service history, modifications, why you're selling…"
          hint={`${form.description.length}/5000`}
          {...bind("description")}
        />
        <div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="Features"
                value={featureDraft}
                maxLength={50}
                placeholder="Type a feature and press Enter"
                onChange={(e) => setFeatureDraft(e.target.value)}
                onKeyDown={onFeatureKey}
                hint={`${form.features.length}/30`}
              />
            </div>
            <Button type="button" variant="outline" className="mt-[22px] h-12" onClick={() => addFeature(featureDraft)} aria-label="Add feature">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {form.features.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Added features">
              {form.features.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => set("features", form.features.filter((x) => x !== f))}
                    className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-accent hover:text-on-accent"
                    aria-label={`Remove ${f}`}
                  >
                    {f} <X className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {FEATURE_SUGGESTIONS.filter((s) => !form.features.some((f) => f.toLowerCase() === s.toLowerCase())).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addFeature(s)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-ink"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {extra}

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={submitting} className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

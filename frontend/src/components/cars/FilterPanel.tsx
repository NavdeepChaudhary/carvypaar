"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { BODY_OPTIONS, CONDITION_OPTIONS, FUEL_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/constants";
import type { MakeModels } from "@/lib/types";

export type FilterValues = Record<string, string | undefined>;

interface FilterPanelProps {
  values: FilterValues;
  makes: MakeModels[];
  onChange: (updates: FilterValues) => void;
  onReset: () => void;
}

const NUMERIC_KEYS = ["min_price", "max_price", "min_year", "max_year", "max_mileage", "location"] as const;
type NumericKey = (typeof NUMERIC_KEYS)[number];

/**
 * Sidebar filters. Selects apply instantly; typed fields apply on blur or Enter
 * so we don't fire a search on every keystroke.
 */
export function FilterPanel({ values, makes, onChange, onReset }: FilterPanelProps) {
  const [draft, setDraft] = useState<Record<NumericKey, string>>(() => pick(values));

  // Keep drafts in sync when the URL changes (back button, chip removal, reset).
  useEffect(() => setDraft(pick(values)), [values]);

  const commit = (key: NumericKey) => {
    const v = draft[key].trim();
    if ((values[key] ?? "") !== v) onChange({ [key]: v || undefined });
  };
  const onEnter = (key: NumericKey) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit(key);
  };
  const numberField = (key: NumericKey, label: string, placeholder: string) => (
    <Input
      label={label}
      type="number"
      inputMode="numeric"
      min={0}
      value={draft[key]}
      placeholder={placeholder}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => commit(key)}
      onKeyDown={onEnter(key)}
    />
  );

  const selectedMake = makes.find((m) => m.make.toLowerCase() === (values.make ?? "").toLowerCase());
  const year = new Date().getFullYear();

  return (
    <div className="space-y-5">
      <Select
        label="Make"
        placeholder="All makes"
        value={selectedMake?.make ?? ""}
        options={makes.map((m) => ({ value: m.make, label: `${m.make} (${m.count})` }))}
        onChange={(e) => onChange({ make: e.target.value || undefined, model: undefined })}
      />
      <Select
        label="Model"
        placeholder={selectedMake ? "All models" : "Choose a make first"}
        disabled={!selectedMake}
        value={values.model ?? ""}
        options={(selectedMake?.models ?? []).map((m) => ({ value: m, label: m }))}
        onChange={(e) => onChange({ model: e.target.value || undefined })}
      />

      <div className="grid grid-cols-2 gap-3">
        {numberField("min_price", "Min price ₹", "0")}
        {numberField("max_price", "Max price ₹", "Any")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {numberField("min_year", "From year", "1990")}
        {numberField("max_year", "To year", String(year))}
      </div>
      {numberField("max_mileage", "Max km", "Any")}

      <Select label="Fuel" placeholder="Any fuel" value={values.fuel_type ?? ""} options={FUEL_OPTIONS}
        onChange={(e) => onChange({ fuel_type: e.target.value || undefined })} />
      <Select label="Transmission" placeholder="Any transmission" value={values.transmission ?? ""}
        options={TRANSMISSION_OPTIONS} onChange={(e) => onChange({ transmission: e.target.value || undefined })} />
      <Select label="Body type" placeholder="Any body" value={values.body_type ?? ""} options={BODY_OPTIONS}
        onChange={(e) => onChange({ body_type: e.target.value || undefined })} />
      <Select label="Condition" placeholder="Any condition" value={values.condition ?? ""} options={CONDITION_OPTIONS}
        onChange={(e) => onChange({ condition: e.target.value || undefined })} />

      <Input
        label="Location"
        value={draft.location}
        placeholder="City"
        maxLength={120}
        onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
        onBlur={() => commit("location")}
        onKeyDown={onEnter("location")}
      />

      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-xl border border-line py-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
      >
        Reset all filters
      </button>
    </div>
  );
}

function pick(values: FilterValues): Record<NumericKey, string> {
  return Object.fromEntries(NUMERIC_KEYS.map((k) => [k, values[k] ?? ""])) as Record<NumericKey, string>;
}

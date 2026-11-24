"use client";

import { motion } from "framer-motion";
import { CalendarDays, Car, Check, Fuel, Gauge, MapPin, Palette, Settings2, Sparkles } from "lucide-react";

import { BODY_OPTIONS, CONDITION_OPTIONS, FUEL_OPTIONS, TRANSMISSION_OPTIONS, labelFor } from "@/lib/constants";
import { formatKm } from "@/lib/format";
import type { ListingDetail } from "@/lib/types";

/** Specs grid + description + features, shared by the car and auction pages. */
export function CarDetails({ car }: { car: ListingDetail }) {
  const specs = [
    { icon: CalendarDays, label: "Year", value: String(car.year) },
    { icon: Gauge, label: "Mileage", value: formatKm(car.mileage) },
    { icon: Fuel, label: "Fuel", value: labelFor(FUEL_OPTIONS, car.fuel_type) },
    { icon: Settings2, label: "Transmission", value: labelFor(TRANSMISSION_OPTIONS, car.transmission) },
    { icon: Car, label: "Body", value: labelFor(BODY_OPTIONS, car.body_type) },
    { icon: Sparkles, label: "Condition", value: labelFor(CONDITION_OPTIONS, car.condition) },
    { icon: Palette, label: "Color", value: car.color },
    { icon: MapPin, label: "Location", value: car.location },
  ];

  return (
    <>
      <section aria-labelledby="specs-heading" className="glass rounded-2xl p-6">
        <h2 id="specs-heading" className="font-display text-lg font-bold uppercase tracking-wide">Specifications</h2>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {specs.map(({ icon: Icon, label, value }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-xl border border-line/60 bg-elevated/40 p-4"
            >
              <Icon className="h-5 w-5 text-ink" aria-hidden />
              <dt className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</dt>
              <dd className="mt-1 truncate font-semibold" title={value}>{value}</dd>
            </motion.div>
          ))}
        </dl>
      </section>

      {car.description && (
        <section aria-labelledby="desc-heading" className="glass rounded-2xl p-6">
          <h2 id="desc-heading" className="font-display text-lg font-bold uppercase tracking-wide">About this car</h2>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-fg/85">{car.description}</p>
        </section>
      )}

      {car.features.length > 0 && (
        <section aria-labelledby="features-heading" className="glass rounded-2xl p-6">
          <h2 id="features-heading" className="font-display text-lg font-bold uppercase tracking-wide">Features</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {car.features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-ink">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

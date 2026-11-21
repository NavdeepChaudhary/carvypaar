"use client";

import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { forwardRef, useId, type SelectHTMLAttributes } from "react";

import type { Option } from "@/lib/constants";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  options: Option[];
  /** Adds a first option with value "" (e.g. "Any"). */
  placeholder?: string;
  error?: string | null;
  hideLabel?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, hideLabel, className, id: idProp, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={clsx(
          "block text-xs font-semibold uppercase tracking-[0.14em] text-muted",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={clsx(
            "h-12 w-full appearance-none rounded-xl border bg-elevated/60 pl-4 pr-10 text-sm text-fg transition-colors",
            "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
            error ? "border-accent" : "border-line",
            className,
          )}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
});

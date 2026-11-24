import type { BodyType, CarCondition, FuelType, ListingStatus, Transmission } from "./types";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const FUEL_OPTIONS: Option<FuelType>[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
  { value: "cng", label: "CNG" },
  { value: "lpg", label: "LPG" },
];

export const TRANSMISSION_OPTIONS: Option<Transmission>[] = [
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automatic" },
  { value: "semi_automatic", label: "Semi-automatic" },
];

export const BODY_OPTIONS: Option<BodyType>[] = [
  { value: "sedan", label: "Sedan" },
  { value: "hatchback", label: "Hatchback" },
  { value: "suv", label: "SUV" },
  { value: "coupe", label: "Coupe" },
  { value: "convertible", label: "Convertible" },
  { value: "wagon", label: "Wagon" },
  { value: "pickup", label: "Pickup" },
  { value: "van", label: "Van" },
  { value: "minivan", label: "Minivan / MPV" },
];

export const CONDITION_OPTIONS: Option<CarCondition>[] = [
  { value: "new", label: "New" },
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Needs work" },
];

export const SORT_OPTIONS: Option[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "year_desc", label: "Year: newest" },
  { value: "year_asc", label: "Year: oldest" },
  { value: "mileage_asc", label: "Lowest mileage" },
];

export const STATUS_STYLES: Record<ListingStatus, { label: string; className: string }> = {
  active: { label: "Live", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  pending: { label: "In review", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  sold: { label: "Sold", className: "bg-neon/15 text-neon" },
  inactive: { label: "Hidden", className: "bg-muted/15 text-muted" },
  rejected: { label: "Rejected", className: "bg-accent/15 text-ink" },
};

export const MAX_PHOTOS = 10;
export const MAX_UPLOAD_MB = 8;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function labelFor<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

/** ₹58,00,000 */
export function formatPrice(value: number): string {
  return inr.format(value);
}

/** Compact Indian notation: ₹58 L, ₹1.9 Cr */
export function formatPriceShort(value: number): string {
  if (value >= 1e7) return `₹${trim(value / 1e7)} Cr`;
  if (value >= 1e5) return `₹${trim(value / 1e5)} L`;
  return formatPrice(value);
}

function trim(n: number): string {
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

export function formatKm(km: number): string {
  return `${num.format(km)} km`;
}

export function formatNumber(n: number): string {
  return num.format(n);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 days ago" */
export function timeAgo(iso: string): string {
  // The API returns UTC; SQLite drops the offset, so treat bare timestamps as UTC.
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

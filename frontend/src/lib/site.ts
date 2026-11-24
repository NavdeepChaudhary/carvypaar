/** Site-wide facts used by metadata, the sitemap and the legal pages. */

export const SITE_NAME = "CarvyPaar";
export const SITE_TAGLINE = "Buy, sell & auction cars";
export const SITE_DESCRIPTION =
  "The car marketplace for enthusiasts in India. Buy, sell and bid on cars in live auctions, with an AI price check on every listing.";

/** The public address of the site, used for absolute links (sitemap, Open Graph, structured data). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "https://carvypaar.vercel.app"
).replace(/\/$/, "");

/** Support inbox shown on the contact and legal pages. Set NEXT_PUBLIC_SUPPORT_EMAIL to show it. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

/** Date the legal pages were last changed. Update it whenever their wording changes. */
export const LEGAL_UPDATED = "24 November 2026";

/** True while building the backend-less static preview (GitHub Pages). */
export const IS_STATIC_EXPORT = process.env.GITHUB_PAGES === "true";

/** Turns a path ("/uploads/x.jpg") into a full URL; leaves full URLs alone. */
export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

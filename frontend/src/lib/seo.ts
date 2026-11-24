/** Metadata and schema.org structured data for car and auction pages. */
import type { Metadata } from "next";

import { BODY_OPTIONS, FUEL_OPTIONS, TRANSMISSION_OPTIONS, labelFor } from "./constants";
import { formatKm, formatPrice } from "./format";
import { SITE_NAME, absoluteUrl } from "./site";
import type { ListingDetail } from "./types";

function summary(l: ListingDetail): string {
  const bits = [
    formatKm(l.mileage),
    labelFor(FUEL_OPTIONS, l.fuel_type),
    labelFor(TRANSMISSION_OPTIONS, l.transmission),
    l.location,
  ].filter(Boolean);
  return bits.join(" · ");
}

function trim(text: string, max = 155): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function photos(l: ListingDetail): string[] {
  const urls = l.images.length ? [...l.images].sort((a, b) => a.position - b.position).map((i) => i.url) : [];
  if (!urls.length && l.cover_image) urls.push(l.cover_image);
  return urls.map(absoluteUrl);
}

export function listingMetadata(l: ListingDetail, path: string, kind: "sale" | "auction" = "sale"): Metadata {
  const name = `${l.year} ${l.make} ${l.model}`;
  const title = kind === "auction" ? `Auction: ${name}` : `${name} for ${formatPrice(Number(l.price))}`;
  const description = trim(`${summary(l)}. ${l.description || l.title}`);
  const images = photos(l).slice(0, 4);
  // Pending or rejected listings are visible only to their owner and admins: keep them out of search.
  const indexable = l.status === "active" || l.status === "sold";
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${title} | ${SITE_NAME}`,
      description,
      url: path,
      images: images.map((url) => ({ url, alt: name })),
    },
    twitter: { card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description, images },
  };
}

/** schema.org Car + Offer, which lets Google show price, year and kilometres in results. */
export function listingJsonLd(l: ListingDetail, path: string, price = l.price): Record<string, unknown> {
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    name: `${l.year} ${l.make} ${l.model}`,
    description: trim(l.description || l.title, 500),
    url,
    image: photos(l),
    brand: { "@type": "Brand", name: l.make },
    model: l.model,
    vehicleModelDate: String(l.year),
    bodyType: labelFor(BODY_OPTIONS, l.body_type),
    fuelType: labelFor(FUEL_OPTIONS, l.fuel_type),
    vehicleTransmission: labelFor(TRANSMISSION_OPTIONS, l.transmission),
    color: l.color || undefined,
    mileageFromOdometer: { "@type": "QuantitativeValue", value: l.mileage, unitCode: "KMT" },
    itemCondition: l.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      url,
      price: Number(price),
      priceCurrency: "INR",
      availability: l.status === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      areaServed: l.location || undefined,
      seller: { "@type": "Person", name: l.seller.full_name },
    },
  };
}

/** Safe to put inside a <script> tag: "<" can't close the tag early. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, String.fromCharCode(92) + "u003c");
}

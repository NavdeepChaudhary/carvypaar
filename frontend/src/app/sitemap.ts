import type { MetadataRoute } from "next";

import { BODY_OPTIONS } from "@/lib/constants";
import { listActiveListingIds } from "@/lib/server-api";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600; // rebuilt at most once an hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  });

  const fixed = [
    page("/", 1, "daily"),
    page("/cars", 0.9, "daily"),
    page("/auctions", 0.9, "daily"),
    page("/price-check", 0.7),
    ...BODY_OPTIONS.map((o) => page(`/cars?body_type=${o.value}`, 0.6, "daily")),
    page("/about", 0.4, "monthly"),
    page("/contact", 0.4, "monthly"),
    page("/auction-rules", 0.4, "monthly"),
    page("/terms", 0.2, "monthly"),
    page("/privacy", 0.2, "monthly"),
  ];

  const cars = (await listActiveListingIds()).map((l) => ({
    url: `${SITE_URL}/cars/${l.id}`,
    lastModified: l.created_at,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...fixed, ...cars];
}

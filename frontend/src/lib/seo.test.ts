import { describe, expect, it } from "vitest";

import { jsonLdString, listingJsonLd, listingMetadata } from "./seo";
import { absoluteUrl, SITE_URL } from "./site";
import type { ListingDetail } from "./types";

const car = {
  id: 7,
  title: "Well kept Creta",
  make: "Hyundai",
  model: "Creta",
  year: 2021,
  mileage: 32000,
  fuel_type: "diesel",
  transmission: "automatic",
  body_type: "suv",
  condition: "excellent",
  location: "Pune",
  price: "1150000.00" as unknown as number, // the API sends Decimals as strings
  listing_type: "sale",
  status: "active",
  cover_image: null,
  image_count: 2,
  views_count: 0,
  created_at: "2026-11-01T00:00:00Z",
  is_favorite: false,
  auction_id: null,
  estimated_price: null,
  price_rating: null,
  color: "White",
  description: "Single owner, full service history. </script><b>x</b>",
  features: [],
  images: [
    { id: 2, url: "https://cdn.example.com/b.jpg", position: 1 },
    { id: 1, url: "/uploads/a.jpg", position: 0 },
  ],
  seller: { id: 3, full_name: "Asha", avatar_url: null, location: "Pune", role: "seller", created_at: "" },
  favorites_count: 0,
  updated_at: "",
  is_owner: false,
  price_insight: null,
} as ListingDetail;

describe("seo", () => {
  it("absoluteUrl keeps full URLs and prefixes paths", () => {
    expect(absoluteUrl("https://x.y/z")).toBe("https://x.y/z");
    expect(absoluteUrl("/uploads/a.jpg")).toBe(`${SITE_URL}/uploads/a.jpg`);
  });

  it("builds a car title, description and photos in gallery order", () => {
    const m = listingMetadata(car, "/cars/7");
    expect(m.title).toMatch(/^2021 Hyundai Creta for ₹11,50,000$/);
    expect(m.description).toContain("32,000 km · Diesel · Automatic · Pune");
    expect(m.robots).toBeUndefined();
    const images = (m.openGraph?.images as { url: string }[]).map((i) => i.url);
    expect(images).toEqual([`${SITE_URL}/uploads/a.jpg`, "https://cdn.example.com/b.jpg"]);
  });

  it("keeps listings that aren't live out of search", () => {
    expect(listingMetadata({ ...car, status: "pending" }, "/cars/7").robots).toEqual({ index: false, follow: false });
  });

  it("produces schema.org Car data with an INR offer, safe to inline", () => {
    const ld = listingJsonLd(car, "/cars/7") as { offers: { price: number; priceCurrency: string } };
    expect(ld.offers.price).toBe(1150000);
    expect(ld.offers.priceCurrency).toBe("INR");
    expect(jsonLdString(ld)).not.toContain("</script>");
  });
});

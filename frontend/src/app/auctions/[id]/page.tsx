import type { Metadata } from "next";
import { Suspense } from "react";

import { jsonLdString, listingJsonLd, listingMetadata } from "@/lib/seo";
import { getAuction } from "@/lib/server-api";

import AuctionDetail from "./AuctionDetail";

type Props = { params: Promise<{ id: string }> };

// A static export (the GitHub Pages preview) must know every URL at build time, but listing ids
// only exist in the database. One placeholder keeps the route buildable there; normal
// deployments render any id on demand. The auction UI itself is a client component.
export function generateStaticParams() {
  return process.env.GITHUB_PAGES === "true" ? [{ id: "0" }] : [];
}

/** Title, description and share preview (the car's photo) for this auction. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getAuction(id);
  return data ? listingMetadata(data.listing, `/auctions/${id}`, "auction") : { title: "Live auction" };
}

async function StructuredData({ id }: { id: string }) {
  const data = await getAuction(id);
  if (!data || data.auction.status !== "live") return null;
  const price = data.auction.current_price ?? data.auction.starting_price;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdString(listingJsonLd(data.listing, `/auctions/${id}`, price)) }}
    />
  );
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <>
      <Suspense fallback={null}>
        <StructuredData id={id} />
      </Suspense>
      <AuctionDetail />
    </>
  );
}

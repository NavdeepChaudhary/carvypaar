import type { Metadata } from "next";
import { Suspense } from "react";

import { jsonLdString, listingJsonLd, listingMetadata } from "@/lib/seo";
import { getListing } from "@/lib/server-api";

import CarDetail from "./CarDetail";

type Props = { params: Promise<{ id: string }> };

// A static export (the GitHub Pages preview) must know every URL at build time, but listing ids
// only exist in the database. One placeholder keeps the route buildable there; normal
// deployments render any id on demand. The car UI itself is a client component.
export function generateStaticParams() {
  return process.env.GITHUB_PAGES === "true" ? [{ id: "0" }] : [];
}

/** Title, description and share preview (the car's photo) for this listing. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  return listing ? listingMetadata(listing, `/cars/${id}`) : { title: "Car for sale" };
}

/** schema.org data for search engines. Streamed in, so a slow backend never delays the page. */
async function StructuredData({ id }: { id: string }) {
  const listing = await getListing(id);
  if (!listing || listing.status !== "active") return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(listingJsonLd(listing, `/cars/${id}`)) }} />;
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <>
      <Suspense fallback={null}>
        <StructuredData id={id} />
      </Suspense>
      <CarDetail />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, List, Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "About us",
  description: "CarVypaar is a used-car marketplace for India with live auctions and an AI price check on every listing.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPage
      title="About CarVypaar"
      showUpdated={false}
      intro="CarVypaar is a car marketplace built for people who love cars. Buy one, sell one, or win one in a live auction, and know what it's really worth before you decide."
    >
      <Section title="Why we built it">
        <p>
          Buying or selling a used car often means guessing the right price and hoping the other side is honest. We
          wanted a place where prices are clear and listings are checked, and where an auction is a fair race.
        </p>
      </Section>

      <Section title="What makes it different">
        <List
          items={[
            <><strong>AI price check:</strong> every listing gets an estimate based on market data, so you can tell a fair deal from an overpriced one.</>,
            <><strong>Reviewed listings:</strong> our team checks each listing before it goes live, and rejects ones that look wrong.</>,
            <><strong>Fair live auctions:</strong> everyone sees the same price in real time, and late bids extend the clock so nobody gets sniped.</>,
            <><strong>Free to join:</strong> browsing, listing and bidding cost nothing.</>,
          ]}
        />
      </Section>

      <Section title="Get started">
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/cars" className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-on-accent hover:shadow-glow">
            Browse cars
          </Link>
          <Link href="/sell" className="rounded-xl border border-line px-5 py-2.5 font-semibold hover:border-accent">
            Sell your car
          </Link>
        </div>
      </Section>
    </LegalPage>
  );
}

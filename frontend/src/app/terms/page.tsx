import type { Metadata } from "next";
import Link from "next/link";

import { ContactLine, LegalPage, List, Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for buying, selling and bidding on CarvyPaar.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro="These terms apply to everyone who uses CarvyPaar. By creating an account or using the site, you agree to them."
    >
      <Section title="What CarvyPaar is">
        <p>
          CarvyPaar is an online marketplace where people list, find and bid on cars. We are not the buyer or the
          seller of any car. Every sale is an agreement between the buyer and the seller, and they are responsible for
          it.
        </p>
      </Section>

      <Section title="Your account">
        <List
          items={[
            "You must be at least 18 years old and able to enter a legal contract in India.",
            "The details you give us must be true and kept up to date.",
            "You are responsible for everything done through your account. Keep your password safe.",
            "One person, one account. Don't sign up for or act on behalf of someone else without their permission.",
          ]}
        />
      </Section>

      <Section title="Selling a car">
        <List
          items={[
            "You may list only cars you own or are authorised to sell.",
            "Listings must be accurate: make, model, year, kilometres driven, condition, accident history and any known faults.",
            "Photos must be of the actual car and must be yours to use.",
            "We review listings before they go live and may reject or remove any listing that breaks these terms.",
            "You must transfer ownership (RC transfer) and hand over valid documents to the buyer, as the law requires.",
          ]}
        />
      </Section>

      <Section title="Buying and bidding">
        <List
          items={[
            "Check the car and its papers (RC, insurance, PUC, service history) yourself before you pay.",
            "Offers and bids are serious commitments. Only bid if you intend to buy at that price.",
            <>
              Auctions follow our{" "}
              <Link href="/auction-rules" className="font-medium text-accent hover:underline">
                auction rules
              </Link>
              .
            </>,
          ]}
        />
      </Section>

      <Section title="AI price check">
        <p>
          Price estimates are produced automatically from market data and the car&apos;s details. They are a guide, not a
          valuation or a guarantee. Don&apos;t rely on them alone when deciding what to pay or charge.
        </p>
      </Section>

      <Section title="Things you must not do">
        <List
          items={[
            "List stolen cars, cars with false papers, or cars you can't legally sell.",
            "Post false, misleading or offensive content, or spam other members.",
            "Place fake bids, bid on your own car, or try to push prices up artificially.",
            "Try to break, overload or get around the security of the site.",
            "Use the site to collect other members' personal details.",
          ]}
        />
        <p>We may suspend or close accounts that break these terms.</p>
      </Section>

      <Section title="Fees">
        <p>
          Creating an account, browsing and listing a car are free. If we introduce fees, such as a commission on
          completed sales, we will show them clearly before you are charged.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          We work to keep CarvyPaar accurate and available, but we provide it &quot;as is&quot;. We are not responsible
          for the condition, legality or ownership of any car, for what members say in listings or messages, or for
          any dispute between a buyer and a seller. To the extent the law allows, our liability to you is limited to
          the fees, if any, you have paid us.
        </p>
      </Section>

      <Section title="Law and disputes">
        <p>
          These terms are governed by the laws of India. If something goes wrong, please contact us first so we can try
          to sort it out. To raise a complaint, <ContactLine />.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. When we do, we will change the date at the top of this page. If you keep using
          CarvyPaar after a change, the new terms apply to you.
        </p>
      </Section>
    </LegalPage>
  );
}

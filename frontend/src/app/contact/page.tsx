import { Mail, MessageSquare, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, Section } from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get help with your CarvyPaar account, a listing or an auction.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      showUpdated={false}
      intro="Questions about your account, a listing or an auction? We're happy to help."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-2xl p-5">
          <Mail className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="mt-3 font-semibold">Email support</h2>
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block break-all text-sm text-accent hover:underline">
              {SUPPORT_EMAIL}
            </a>
          ) : (
            <p className="mt-1 text-sm text-muted">Our support inbox is being set up.</p>
          )}
          <p className="mt-2 text-xs text-muted">We aim to reply within 2 working days.</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <MessageSquare className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="mt-3 font-semibold">About a car</h2>
          <p className="mt-1 text-sm text-muted">
            Message the seller from the car&apos;s page. Your conversations are in{" "}
            <Link href="/garage" className="text-accent hover:underline">
              My garage
            </Link>
            .
          </p>
        </div>
        <div className="glass rounded-2xl p-5">
          <ShieldAlert className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="mt-3 font-semibold">Report a problem</h2>
          <p className="mt-1 text-sm text-muted">
            Seen a fake listing or suspicious bidding? Tell us the car&apos;s link and what looks wrong.
          </p>
        </div>
      </div>

      <Section title="Grievances">
        <p>
          If you have a complaint about content on CarvyPaar or how we handle your data, write to us
          {SUPPORT_EMAIL ? (
            <>
              {" "}at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </>
          ) : null}{" "}
          with the subject &quot;Grievance&quot;. We will acknowledge it within 24 hours and aim to resolve it within
          15 days.
        </p>
        <p className="text-sm text-muted">
          See also our{" "}
          <Link href="/terms" className="text-accent hover:underline">Terms of Use</Link>,{" "}
          <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link> and{" "}
          <Link href="/auction-rules" className="text-accent hover:underline">Auction Rules</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}

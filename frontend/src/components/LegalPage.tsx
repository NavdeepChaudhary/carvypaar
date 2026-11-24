import Link from "next/link";
import type { ReactNode } from "react";

import { LEGAL_UPDATED, SUPPORT_EMAIL } from "@/lib/site";

/** Shared layout for the text pages (privacy, terms, auction rules, about, contact). */
export function LegalPage({
  title,
  intro,
  showUpdated = true,
  children,
}: {
  title: string;
  intro?: string;
  showUpdated?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-14">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">{title}</h1>
      {showUpdated && <p className="mt-2 text-sm text-muted">Last updated: {LEGAL_UPDATED}</p>}
      {intro && <p className="mt-6 text-lg leading-relaxed text-muted">{intro}</p>}
      <div className="legal-body mt-8 space-y-8 leading-relaxed">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] text-fg">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** "email us at x" when a support inbox is set, otherwise a link to the contact page. */
export function ContactLine() {
  return SUPPORT_EMAIL ? (
    <>
      email us at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent hover:underline">
        {SUPPORT_EMAIL}
      </a>
    </>
  ) : (
    <>
      reach us through our{" "}
      <Link href="/contact" className="font-medium text-accent hover:underline">
        contact page
      </Link>
    </>
  );
}

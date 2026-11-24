import { BadgeCheck, Gauge, Gavel, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { BODY_OPTIONS } from "@/lib/constants";

import { Logo } from "./Logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { href: "/cars", label: "Buy a car" },
      { href: "/auctions", label: "Live auctions" },
      { href: "/sell", label: "Sell your car" },
      { href: "/price-check", label: "AI price check" },
    ],
  },
  {
    title: "Browse by type",
    links: BODY_OPTIONS.slice(0, 5).map((o) => ({ href: `/cars?body_type=${o.value}`, label: o.label })),
  },
  {
    title: "Your account",
    links: [
      { href: "/garage", label: "My garage" },
      { href: "/profile", label: "Profile" },
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create account" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact us" },
      { href: "/auction-rules", label: "Auction rules" },
    ],
  },
];

const LEGAL = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/auction-rules", label: "Auction Rules" },
  { href: "/contact", label: "Contact" },
];

const TRUST = [
  { icon: BadgeCheck, label: "Reviewed listings" },
  { icon: Gauge, label: "AI price checks" },
  { icon: Gavel, label: "Fair auctions" },
  { icon: ShieldCheck, label: "Secure accounts" },
];

export function Footer() {
  return (
    <footer className="bg-navy text-white/75">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/60">
            The car marketplace for people who love cars. Buy, sell and bid with an AI price check on every listing.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-navy-line">
        <div className="container-page flex flex-col items-center justify-between gap-4 py-6 text-xs sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <p>&copy; {new Date().getFullYear()} CarvyPaar. Built for people who love cars.</p>
            <nav aria-label="Legal">
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                {LEGAL.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="underline-offset-2 transition-colors hover:text-accent hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <ul className="flex flex-wrap justify-center gap-4">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

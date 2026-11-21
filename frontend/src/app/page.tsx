import { Car, Gavel, Gauge, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Hero } from "@/components/Hero";
import { LiveAuctionsStrip } from "@/components/home/LiveAuctionsStrip";
import { LiveStats } from "@/components/home/LiveStats";

const FEATURES = [
  {
    icon: Car,
    title: "Buy & sell",
    body: "List your car in minutes with up to 10 photos. Filter thousands of cars by make, price, mileage and more.",
  },
  {
    icon: Gavel,
    title: "Live auctions",
    body: "Bid in real time with live countdowns. Anti-sniping protection keeps every auction fair to the last second.",
  },
  {
    icon: Gauge,
    title: "AI price check",
    body: "Our model estimates what any car is worth and flags each listing as a great deal, fair, or overpriced.",
  },
  {
    icon: ShieldCheck,
    title: "Verified listings",
    body: "Every listing is reviewed before it goes live, so you only see real cars from real sellers.",
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />

      <LiveStats />
      <LiveAuctionsStrip />

      <section className="container-page py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Why CarvyPaar</p>
          <h2 className="mt-3 font-display text-3xl font-black uppercase sm:text-4xl">Built for people who love cars</h2>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="glass group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/60 hover:shadow-glow"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold uppercase tracking-wide">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap justify-center gap-4 text-center">
          <Link
            href="/price-check"
            className="inline-flex h-14 items-center rounded-xl border border-neon/60 px-8 font-semibold uppercase tracking-wider text-neon transition-shadow hover:shadow-glow-cyan"
          >
            What&apos;s my car worth?
          </Link>
          <Link
            href="/register"
            className="inline-flex h-14 items-center rounded-xl bg-accent px-8 font-semibold uppercase tracking-wider text-white transition-shadow hover:shadow-glow"
          >
            Create your free account
          </Link>
        </div>
      </section>
    </>
  );
}

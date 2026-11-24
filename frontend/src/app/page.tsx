import {
  ArrowRight,
  BadgeCheck,
  Car,
  ChevronRight,
  Gauge,
  Gavel,
  Handshake,
  KeyRound,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { Hero } from "@/components/Hero";
import { LiveAuctionsStrip } from "@/components/home/LiveAuctionsStrip";
import { LiveStats } from "@/components/home/LiveStats";
import { TopPicks } from "@/components/home/TopPicks";

const img = (id: string, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

const BODY_TYPES = [
  { value: "hatchback", label: "Hatchbacks", blurb: "Easy city drivers", photo: "1549399542-7e3f8b79c341" },
  { value: "sedan", label: "Sedans", blurb: "Comfort for the long haul", photo: "1555215695-3004980ad54e" },
  { value: "suv", label: "SUVs", blurb: "Room for everything", photo: "1533473359331-0135ef1b58bf" },
  { value: "coupe", label: "Coupes", blurb: "Built to thrill", photo: "1503376780353-7e6692767b70" },
  { value: "convertible", label: "Convertibles", blurb: "Roof down, sun out", photo: "1525609004556-c46c7d6cf023" },
];

const STEPS = [
  { icon: Search, title: "Search", body: "Filter by make, budget, fuel and more." },
  { icon: Gauge, title: "Check the price", body: "Our AI says if it's a great deal, fair or overpriced." },
  { icon: Gavel, title: "Bid or offer", body: "Win a live auction or send the seller an offer." },
  { icon: Handshake, title: "Meet the seller", body: "Message in the app and inspect the car." },
  { icon: KeyRound, title: "Drive home", body: "Close the deal and enjoy the road." },
];

const FEATURES = [
  {
    icon: Car,
    title: "Buy and sell",
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

      {/* Choose your ride */}
      <section className="container-page pt-20" aria-labelledby="types-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="types-heading" className="section-title">Choose your ride</h2>
            <p className="mt-1 text-sm text-muted">Find the right car for your next adventure.</p>
          </div>
          <Link
            href="/cars"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-accent"
          >
            View all cars <ArrowRight className="h-4 w-4 text-ink dark:text-accent" aria-hidden />
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {BODY_TYPES.map((t) => (
            <li key={t.value}>
              <Link
                href={`/cars?body_type=${t.value}`}
                className="glass group flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-lift"
              >
                <div className="aspect-[4/3] overflow-hidden bg-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img(t.photo, 500)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
                <div className="flex flex-1 items-center justify-between gap-2 p-4">
                  <div>
                    <h3 className="font-display font-bold">{t.label}</h3>
                    <p className="text-xs text-muted">{t.blurb}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink transition-transform group-hover:translate-x-1 dark:text-accent" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Promo banners */}
      <section className="container-page grid gap-5 pt-12 lg:grid-cols-2" aria-label="Highlights">
        <div className="relative overflow-hidden rounded-2xl bg-navy p-8 text-white sm:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img("1544636331-e26879cd4d9b", 1000)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-navy via-navy/80 to-transparent" />
          <div className="relative max-w-xs">
            <p className="text-sm font-semibold text-white/80">Live auctions</p>
            <p className="mt-1 font-display text-3xl font-extrabold leading-tight">
              Bid live. <span className="text-accent">Win fair.</span>
            </p>
            <p className="mt-2 text-sm text-white/75">A late bid extends the clock, so nobody gets sniped at the last second.</p>
            <Link
              href="/auctions"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-bold text-on-accent hover:shadow-glow"
            >
              Start bidding <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-8 sm:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img("1583121274602-3e2820c69888", 1000)}
            alt=""
            className="absolute inset-y-0 right-0 h-full w-1/2 object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/95 to-transparent" />
          <div className="relative max-w-xs">
            <p className="text-sm font-semibold text-muted">AI price check</p>
            <p className="mt-1 font-display text-3xl font-extrabold leading-tight">
              What&apos;s your car <span className="text-ink dark:text-accent">really worth?</span>
            </p>
            <p className="mt-2 text-sm text-muted">A free estimate in seconds, with the factors behind it.</p>
            <Link
              href="/price-check"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-navy px-5 text-sm font-bold text-white hover:bg-navy-soft"
            >
              Check my price <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <TopPicks />
      <LiveAuctionsStrip />

      {/* How it works */}
      <section className="container-page pt-20" aria-labelledby="how-heading">
        <h2 id="how-heading" className="section-title text-center">How it works</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative flex flex-col items-center text-center">
              {i < STEPS.length - 1 && (
                <span aria-hidden className="absolute left-[calc(50%+2.5rem)] top-8 hidden h-px w-[calc(100%-5rem)] border-t-2 border-dashed border-line lg:block" />
              )}
              <span className="grid h-16 w-16 place-items-center rounded-full bg-accent/20 text-ink dark:text-accent">
                <Icon className="h-7 w-7" aria-hidden />
              </span>
              <h3 className="mt-4 font-display font-bold">
                <span className="text-ink dark:text-accent">{i + 1}.</span> {title}
              </h3>
              <p className="mt-1 max-w-[14rem] text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why CarvyPaar */}
      <section className="container-page pt-20" aria-labelledby="why-heading">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-ink dark:text-accent">Why CarvyPaar</p>
          <h2 id="why-heading" className="section-title mt-2">Built for people who love cars</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="glass group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-lift">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-ink transition-colors group-hover:bg-accent group-hover:text-on-accent dark:text-accent">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="container-page pb-20 pt-20" aria-label="Get started">
        <div className="relative overflow-hidden rounded-3xl bg-navy px-8 py-12 text-white sm:px-12">
          <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <BadgeCheck className="h-4 w-4" aria-hidden /> Free to join
              </p>
              <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                Ready to find your next car, or sell the one you have?
              </h2>
              <p className="mt-3 text-white/70">Create an account to save cars, bid in auctions and list your own.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center rounded-lg bg-accent px-7 font-bold text-on-accent hover:shadow-glow"
              >
                Create free account
              </Link>
              <Link
                href="/sell"
                className="inline-flex h-12 items-center rounded-lg border border-white/25 px-7 font-semibold text-white hover:border-accent hover:text-accent"
              >
                Sell your car
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

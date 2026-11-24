"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { BadgeCheck, Car, Gauge, Gavel, Hand, Search, Tag } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { BODY_OPTIONS, FUEL_OPTIONS } from "@/lib/constants";

// Three.js only runs in the browser, and the hero text shouldn't wait for it.
const CarScene = dynamic(() => import("./three/CarScene").then((m) => m.CarScene), {
  ssr: false,
  loading: () => <CarPlaceholder />,
});

const SCENERY =
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=2400&q=70";

const PAINTS = [
  { name: "Racing yellow", hex: "#ffc107" },
  { name: "Midnight blue", hex: "#1e3a8a" },
  { name: "Rosso red", hex: "#d11a2a" },
  { name: "Pearl white", hex: "#eef1f5" },
  { name: "Graphite", hex: "#3a3f4b" },
];

const PRICE_OPTIONS = [
  { value: "", label: "Any price" },
  { value: "500000", label: "Under ₹5 L" },
  { value: "1000000", label: "Under ₹10 L" },
  { value: "2500000", label: "Under ₹25 L" },
  { value: "5000000", label: "Under ₹50 L" },
];

const TRUST = [
  { icon: BadgeCheck, title: "Verified listings", sub: "Reviewed before going live" },
  { icon: Gauge, title: "AI price check", sub: "Great deal, fair or overpriced" },
  { icon: Gavel, title: "Fair auctions", sub: "Anti-sniping protection" },
];

type Tab = "buy" | "auction" | "sell";
const TABS: { id: Tab; label: string; icon: typeof Car }[] = [
  { id: "buy", label: "Buy a car", icon: Car },
  { id: "auction", label: "Live auctions", icon: Gavel },
  { id: "sell", label: "Sell my car", icon: Tag },
];

function CarPlaceholder() {
  return (
    <div className="grid h-full w-full place-items-center">
      <Car className="h-24 w-24 animate-pulse text-fg/10" aria-hidden />
    </div>
  );
}

const fieldClass =
  "h-12 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg focus:border-accent focus:outline-none";
const labelClass = "mb-1.5 block text-xs font-semibold text-muted";

/** Homepage hero: headline, interactive 3D car and the tabbed search panel. */
export function Hero() {
  const router = useRouter();
  const [paint, setPaint] = useState(PAINTS[0].hex);
  const [webgl, setWebgl] = useState(true);
  const [tab, setTab] = useState<Tab>("buy");
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [fuel, setFuel] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (body) params.set("body_type", body);
    if (fuel) params.set("fuel_type", fuel);
    if (maxPrice) params.set("max_price", maxPrice);
    router.push(`/cars${params.size ? `?${params}` : ""}`);
  };

  return (
    <section className="relative">
      <div className="relative overflow-hidden">
        {/* Scenic backdrop, washed out on the text side so the headline stays readable. */}
        <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-35 dark:opacity-25" style={{ backgroundImage: `url(${SCENERY})` }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/30" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

        <div className="container-page relative grid items-center gap-6 pb-36 pt-10 lg:grid-cols-[1fr_1.15fr] lg:pb-40 lg:pt-14">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-ink"
            >
              <span className="h-2 w-2 animate-pulse-glow rounded-full bg-accent" aria-hidden />
              Live auctions every day
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Drive what moves you.
              <br />
              <span className="relative inline-block text-ink dark:text-accent">
                Your way.
                <span aria-hidden className="absolute -bottom-1 left-0 h-2 w-full rounded-full bg-accent/40" />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 max-w-lg text-base text-muted sm:text-lg"
            >
              Buy, sell and bid on the cars you love. Every listing gets an AI price check, so you know a great
              deal when you see one.
            </motion.p>

            <motion.ul
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8 grid max-w-xl gap-4 sm:grid-cols-3"
            >
              {TRUST.map(({ icon: Icon, title, sub }) => (
                <li key={title} className="flex items-start gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/50 bg-surface text-ink dark:text-accent">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{title}</span>
                    <span className="block text-xs text-muted">{sub}</span>
                  </span>
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Interactive 3D car */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="relative aspect-[4/3] w-full cursor-grab active:cursor-grabbing lg:aspect-[5/4]">
              {webgl ? (
                <CarScene paint={paint} onUnsupported={() => setWebgl(false)} className="absolute inset-0" />
              ) : (
                <div
                  role="img"
                  aria-label="A sports car"
                  className="absolute inset-0 rounded-3xl bg-cover bg-center"
                  style={{ backgroundImage: `url(${SCENERY})` }}
                />
              )}
              {webgl && (
                <p className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-card backdrop-blur">
                  <Hand className="h-3.5 w-3.5" aria-hidden /> Drag to look around
                </p>
              )}
            </div>
            {webgl && (
              <div className="mt-1 flex items-center justify-center gap-3" role="radiogroup" aria-label="Paint colour">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Paint</span>
                {PAINTS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    role="radio"
                    aria-checked={paint === p.hex}
                    aria-label={p.name}
                    title={p.name}
                    onClick={() => setPaint(p.hex)}
                    className={clsx(
                      "h-7 w-7 rounded-full border-2 shadow-card transition-transform hover:scale-110",
                      paint === p.hex ? "scale-110 border-fg" : "border-surface",
                    )}
                    style={{ backgroundColor: p.hex }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Search panel, overlapping the bottom of the hero like a booking widget. */}
      <div className="container-page relative z-10 -mt-28 lg:-mt-32">
        <div className="max-w-5xl">
          <div className="flex gap-1" role="tablist" aria-label="What do you want to do?">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`hero-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`hero-panel-${id}`}
                onClick={() => setTab(id)}
                className={clsx(
                  "flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold transition-colors",
                  tab === id ? "bg-surface text-fg shadow-card" : "bg-surface/60 text-muted hover:text-fg",
                )}
              >
                <Icon className={clsx("h-4 w-4", tab === id && "text-ink dark:text-accent")} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.split(" ").slice(-1)[0]}</span>
              </button>
            ))}
          </div>

          <div
            className="rounded-b-2xl rounded-tr-2xl border border-line bg-surface p-5 shadow-lift"
            role="tabpanel"
            id={`hero-panel-${tab}`}
            aria-labelledby={`hero-tab-${tab}`}
          >
            {tab === "buy" && (
              <form onSubmit={onSubmit} role="search" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] lg:items-end">
                <div>
                  <label htmlFor="hero-q" className={labelClass}>Make or model</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                    <input
                      id="hero-q"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      maxLength={80}
                      placeholder="BMW M3, Swift, Creta…"
                      className={clsx(fieldClass, "pl-9")}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="hero-body" className={labelClass}>Body type</label>
                  <select id="hero-body" value={body} onChange={(e) => setBody(e.target.value)} className={fieldClass}>
                    <option value="">Any body</option>
                    {BODY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="hero-fuel" className={labelClass}>Fuel</label>
                  <select id="hero-fuel" value={fuel} onChange={(e) => setFuel(e.target.value)} className={fieldClass}>
                    <option value="">Any fuel</option>
                    {FUEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="hero-price" className={labelClass}>Budget</label>
                  <select id="hero-price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className={fieldClass}>
                    {PRICE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-7 font-bold text-on-accent transition-shadow hover:shadow-glow sm:col-span-2 lg:col-span-1"
                >
                  <Search className="h-4 w-4" aria-hidden /> Search cars
                </button>
              </form>
            )}

            {tab === "auction" && (
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-display text-lg font-bold">Bid live, win fair.</p>
                  <p className="mt-1 text-sm text-muted">
                    Real-time bidding with live countdowns. A late bid extends the clock, so nobody gets sniped.
                  </p>
                </div>
                <Link
                  href="/auctions"
                  className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-accent px-7 font-bold text-on-accent transition-shadow hover:shadow-glow"
                >
                  <Gavel className="h-4 w-4" aria-hidden /> Browse auctions
                </Link>
              </div>
            )}

            {tab === "sell" && (
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-display text-lg font-bold">Know your price, then list in minutes.</p>
                  <p className="mt-1 text-sm text-muted">
                    Get a free AI estimate, add up to 10 photos and choose a fixed price or an auction.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    href="/price-check"
                    className="inline-flex h-12 items-center gap-2 rounded-lg border border-line px-5 font-semibold hover:border-accent"
                  >
                    <Gauge className="h-4 w-4" aria-hidden /> Check my price
                  </Link>
                  <Link
                    href="/sell"
                    className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-6 font-bold text-on-accent transition-shadow hover:shadow-glow"
                  >
                    <Tag className="h-4 w-4" aria-hidden /> List my car
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

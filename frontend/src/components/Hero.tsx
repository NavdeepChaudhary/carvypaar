"use client";

import { motion } from "framer-motion";
import { ChevronDown, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2400&q=80";

const PRICE_OPTIONS = [
  { value: "", label: "Any price" },
  { value: "500000", label: "Under ₹5 L" },
  { value: "1000000", label: "Under ₹10 L" },
  { value: "2500000", label: "Under ₹25 L" },
  { value: "5000000", label: "Under ₹50 L" },
];

/** Full-screen cinematic hero with the main search bar. */
export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (maxPrice) params.set("max_price", maxPrice);
    // The /cars browse page arrives in Phase 2.
    router.push(`/cars${params.size ? `?${params}` : ""}`);
  };

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      {/* Background image with a slow cinematic zoom */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        initial={{ scale: 1.15 }}
        animate={{ scale: 1 }}
        transition={{ duration: 8, ease: "easeOut" }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-bg" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />

      <div className="container-page relative z-10 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-white/80 backdrop-blur"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent shadow-glow" />
          Live auctions every day
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl font-display text-4xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
        >
          Drive what <span className="text-gradient">moves</span> you.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6 max-w-xl text-base text-white/75 sm:text-lg"
        >
          Buy, sell and bid on the cars you love. Every listing gets an AI price check, so you know a
          great deal when you see one.
        </motion.p>

        <motion.form
          onSubmit={onSubmit}
          role="search"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="mt-10 flex max-w-3xl flex-col gap-2 rounded-2xl border border-white/15 bg-black/40 p-2 shadow-2xl backdrop-blur-xl sm:flex-row"
        >
          <label htmlFor="hero-search" className="sr-only">
            Search make or model
          </label>
          <div className="flex flex-1 items-center gap-3 px-4">
            <Search className="h-5 w-5 shrink-0 text-white/60" aria-hidden />
            <input
              id="hero-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={80}
              placeholder="Search make or model, e.g. BMW M3"
              className="h-12 w-full bg-transparent text-white placeholder:text-white/50 focus:outline-none"
            />
          </div>
          <label htmlFor="hero-price" className="sr-only">
            Maximum price
          </label>
          <select
            id="hero-price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:outline-none sm:w-44"
          >
            {PRICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-neutral-900">
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-12 rounded-xl bg-accent px-8 font-semibold uppercase tracking-wider text-white transition-shadow hover:shadow-glow"
          >
            Search
          </button>
        </motion.form>
      </div>

      <motion.a
        href="#stats"
        aria-label="Scroll to stats"
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-white/60 hover:text-white"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <ChevronDown className="h-7 w-7" />
      </motion.a>
    </section>
  );
}

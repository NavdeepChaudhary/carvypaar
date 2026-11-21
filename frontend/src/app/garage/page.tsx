"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { CarFront, Gavel, HandCoins, Heart, MessageSquare } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { FavoritesTab } from "@/components/garage/FavoritesTab";
import { MessagesTab } from "@/components/garage/MessagesTab";
import { MyBidsTab } from "@/components/garage/MyBidsTab";
import { MyListingsTab } from "@/components/garage/MyListingsTab";
import { OffersTab } from "@/components/garage/OffersTab";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const TABS = [
  { id: "listings", label: "My listings", icon: CarFront },
  { id: "bids", label: "My bids", icon: Gavel },
  { id: "favorites", label: "Saved", icon: Heart },
  { id: "offers", label: "Offers", icon: HandCoins },
  { id: "messages", label: "Messages", icon: MessageSquare },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Garage() {
  const { user, ready } = useRequireAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "listings";

  if (!ready || !user) {
    return (
      <div className="container-page space-y-6 pb-20 pt-28" aria-busy="true">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="container-page pb-20 pt-28">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Dashboard</p>
      <h1 className="mt-2 font-display text-3xl font-black uppercase sm:text-4xl">My garage</h1>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Garage sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => router.replace(`${pathname}?tab=${id}`, { scroll: false })}
            className={clsx(
              "relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
              tab === id ? "text-accent" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
            {tab === id && <motion.span layoutId="garage-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-accent shadow-glow" />}
          </button>
        ))}
      </div>

      <div className="mt-8" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "listings" && <MyListingsTab canSell={user.role !== "buyer"} />}
        {tab === "bids" && <MyBidsTab />}
        {tab === "favorites" && <FavoritesTab />}
        {tab === "offers" && <OffersTab />}
        {tab === "messages" && <MessagesTab meId={user.id} />}
      </div>
    </div>
  );
}

export default function GaragePage() {
  return (
    <Suspense fallback={null}>
      <Garage />
    </Suspense>
  );
}

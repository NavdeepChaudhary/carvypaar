"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { ClipboardCheck, Gavel, LayoutDashboard, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuctionsTable } from "@/components/admin/AuctionsTable";
import { ListingsQueue } from "@/components/admin/ListingsQueue";
import { Overview } from "@/components/admin/Overview";
import { UsersTable } from "@/components/admin/UsersTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "listings", label: "Listings", icon: ClipboardCheck },
  { id: "users", label: "Users", icon: Users },
  { id: "auctions", label: "Auctions", icon: Gavel },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Admin() {
  // Non-admins are bounced home; the API enforces this independently (403).
  const { ready } = useRequireAuth(["admin"], "/");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "overview";
  const [overviewKey, setOverviewKey] = useState(0);
  const go = (id: TabId) => router.replace(`${pathname}?tab=${id}`, { scroll: false });

  if (!ready) {
    return (
      <div className="container-page space-y-6 pb-20 pt-10" aria-busy="true">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="container-page pb-20 pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink">Admin</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold uppercase sm:text-4xl">Control room</h1>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Admin sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" id={`admin-tab-${id}`} aria-selected={tab === id} aria-controls={`admin-panel-${id}`}
            onClick={() => go(id)}
            className={clsx("relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
              tab === id ? "text-ink" : "text-muted hover:text-fg")}>
            <Icon className="h-4 w-4" aria-hidden /> {label}
            {tab === id && <motion.span layoutId="admin-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-accent shadow-glow" />}
          </button>
        ))}
      </div>

      <div className="mt-8" role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
        {tab === "overview" && <Overview key={overviewKey} onReview={() => go("listings")} />}
        {tab === "listings" && <ListingsQueue onChanged={() => setOverviewKey((k) => k + 1)} />}
        {tab === "users" && <UsersTable />}
        {tab === "auctions" && <AuctionsTable />}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <Admin />
    </Suspense>
  );
}

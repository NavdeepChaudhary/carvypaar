"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Gauge, Gavel, LogOut, Menu, Plus, User as UserIcon, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";

import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { Skeleton } from "./ui/Skeleton";

/** Primary navigation. */
const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/cars", label: "Buy a car" },
  { href: "/auctions", label: "Auctions" },
  { href: "/price-check", label: "Price check" },
  { href: "/garage", label: "My garage" },
];

const TOP_BAR = [
  { icon: Gavel, text: "Live auctions every day" },
  { icon: Gauge, text: "AI price check on every listing" },
  { icon: BadgeCheck, text: "Verified listings only" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const links = user?.role === "admin" ? [...NAV_LINKS, { href: "/admin", label: "Admin" }] : NAV_LINKS;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out. See you on the road.");
    router.push("/");
  };

  const authArea = loading ? (
    <Skeleton className="h-10 w-28 rounded-xl" />
  ) : user ? (
    <div className="flex items-center gap-2">
      <Link
        href="/profile"
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-line px-3 text-sm font-medium hover:border-accent"
      >
        <UserIcon className="h-4 w-4" aria-hidden />
        <span className="max-w-[7rem] truncate">{user.full_name.split(" ")[0]}</span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="grid h-10 w-10 place-items-center rounded-xl border border-line hover:border-accent hover:text-ink"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  ) : (
    <Link href="/login" className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold hover:text-ink">
      <UserIcon className="h-4 w-4" aria-hidden />
      Sign in / Register
    </Link>
  );

  const sellButton = (
    <Link
      href="/sell"
      className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-bold text-on-accent transition-shadow hover:shadow-glow"
    >
      <Plus className="h-4 w-4" aria-hidden />
      Sell your car
    </Link>
  );

  return (
    <>
      {/* Navy info strip (scrolls away; the main bar below stays pinned). */}
      <div className="hidden bg-navy text-xs text-white/80 md:block">
        <div className="container-page flex h-9 items-center justify-between gap-6">
          <ul className="flex items-center gap-6">
            {TOP_BAR.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <Link href="/price-check" className="font-semibold text-accent hover:underline">
            What&apos;s my car worth? →
          </Link>
        </div>
      </div>

      <header
        className={clsx(
          "sticky top-0 z-50 border-b bg-surface/95 backdrop-blur transition-shadow duration-300",
          scrolled ? "border-line shadow-card" : "border-transparent",
        )}
      >
        <nav className="container-page flex h-16 items-center justify-between gap-4 lg:h-[72px]" aria-label="Main">
          <Logo />

          <ul className="hidden items-center xl:flex">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "relative whitespace-nowrap px-2.5 py-2 text-sm font-semibold uppercase tracking-wide transition-colors hover:text-ink",
                      active ? "text-ink" : "text-fg/80",
                    )}
                  >
                    {link.label}
                    {active && <span aria-hidden className="absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* One shared container so the bell (and its WebSocket) mounts exactly once. */}
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden xl:block">{authArea}</div>
            <div className="hidden sm:block">{sellButton}</div>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-line xl:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              id="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-line bg-surface xl:hidden"
            >
              <div className="container-page flex flex-col gap-1 py-4">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive(pathname, link.href) ? "page" : undefined}
                    className={clsx(
                      "rounded-lg px-3 py-2.5 text-base font-semibold hover:bg-elevated",
                      isActive(pathname, link.href) && "bg-accent/15 text-ink",
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="neon-line my-3" />
                <div className="flex flex-wrap items-center gap-3">
                  {authArea}
                  <div className="sm:hidden">{sellButton}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}

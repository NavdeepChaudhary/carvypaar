"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, User as UserIcon, X } from "lucide-react";
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
  { href: "/cars", label: "Browse" },
  { href: "/auctions", label: "Auctions" },
  { href: "/price-check", label: "Price check" },
  { href: "/sell", label: "Sell" },
  { href: "/garage", label: "My garage" },
];

function isActive(pathname: string, href: string): boolean {
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
    const onScroll = () => setScrolled(window.scrollY > 12);
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
        className="flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium hover:border-accent"
      >
        <UserIcon className="h-4 w-4" aria-hidden />
        <span className="max-w-[10rem] truncate">{user.full_name.split(" ")[0]}</span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="grid h-10 w-10 place-items-center rounded-xl border border-line hover:border-accent hover:text-accent"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/login" className="h-10 rounded-xl px-4 text-sm font-semibold leading-10 hover:text-accent">
        Sign in
      </Link>
      <Link
        href="/register"
        className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold leading-10 text-white transition-shadow hover:shadow-glow"
      >
        Get started
      </Link>
    </div>
  );

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass border-x-0 border-t-0 py-2" : "bg-transparent py-4",
      )}
    >
      <nav className="container-page flex items-center justify-between gap-4" aria-label="Main">
        <Logo />

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(pathname, link.href) ? "page" : undefined}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:text-accent",
                  isActive(pathname, link.href) ? "text-accent" : "text-fg/80",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* One shared container so the bell (and its WebSocket) mounts exactly once. */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <div className="hidden md:block">{authArea}</div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line md:hidden"
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
            className="glass overflow-hidden border-x-0 md:hidden"
          >
            <div className="container-page flex flex-col gap-3 py-4">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="py-2 text-base font-medium hover:text-accent">
                  {link.label}
                </Link>
              ))}
              <div className="neon-line opacity-40" />
              {authArea}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

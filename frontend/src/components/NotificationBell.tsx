"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, Gavel, HandCoins, MessageSquare, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { useSocket, type SocketMessage } from "@/hooks/useSocket";
import { notificationsApi } from "@/lib/auctions";
import { timeAgo } from "@/lib/format";
import type { AppNotification, NotificationType } from "@/lib/types";

const ICONS: Partial<Record<NotificationType, typeof Bell>> = {
  outbid: Gavel,
  auction_won: Trophy,
  auction_ended: Gavel,
  offer_received: HandCoins,
  offer_updated: HandCoins,
  message: MessageSquare,
};

/** Bell with unread badge; new notifications arrive live over /api/ws/notifications. */
export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    notificationsApi
      .list()
      .then((res) => {
        setItems(res.items);
        setUnread(res.unread_count);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) load();
    else {
      setItems([]);
      setUnread(0);
    }
  }, [user, load]);

  const go = useCallback(
    (n: AppNotification) => {
      setOpen(false);
      if (!n.is_read) {
        setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnread((u) => Math.max(0, u - 1));
        void notificationsApi.markRead(n.id).catch(() => undefined);
      }
      if (n.link) router.push(n.link);
    },
    [router],
  );

  const onMessage = useCallback(
    (msg: SocketMessage) => {
      if (msg.type !== "notification") return;
      const n = msg.notification as AppNotification;
      setItems((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, 20));
      setUnread((u) => u + 1);
      setBump((b) => b + 1);
      const show = n.type === "auction_won" ? toast.success : n.type === "outbid" ? toast.warning : toast;
      show(n.title, {
        description: n.body || undefined,
        action: n.link ? { label: "View", onClick: () => go(n) } : undefined,
      });
    },
    [go],
  );

  useSocket("/api/ws/notifications", onMessage, { authenticate: true, authKey: user?.id, enabled: !!user });

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = async () => {
    setItems((list) => list.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    await notificationsApi.markAllRead().catch(() => undefined);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={rootRef}>
      <motion.button
        key={bump}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        animate={bump ? { rotate: [0, -18, 14, -8, 0] } : undefined}
        transition={{ duration: 0.6 }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-line hover:border-accent hover:text-accent"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white shadow-glow">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
              <p className="font-display text-sm font-bold uppercase tracking-wide">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={markAll} className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-line/60 overflow-y-auto">
                {items.map((n) => {
                  const Icon = ICONS[n.type] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => go(n)}
                        className={clsx("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated", !n.is_read && "bg-accent/5")}>
                        <span className={clsx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                          n.type === "auction_won" ? "bg-emerald-500/15 text-emerald-400" : "bg-accent/10 text-accent")}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-snug">{n.title}</span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                          <span className="mt-1 block text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                        </span>
                        {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

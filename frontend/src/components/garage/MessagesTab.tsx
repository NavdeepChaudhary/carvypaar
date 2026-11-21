"use client";

import { clsx } from "clsx";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { messagesApi } from "@/lib/listings";
import type { Message, PublicUser } from "@/lib/types";

interface Thread {
  key: string;
  listingId: number;
  listingTitle: string;
  other: PublicUser;
  messages: Message[]; // oldest first
  unread: number;
}

/** Group a flat message list into conversations: one per (listing, other person). */
function toThreads(messages: Message[], meId: number): Thread[] {
  const map = new Map<string, Thread>();
  for (const m of messages) {
    const other = m.sender.id === meId ? m.recipient : m.sender;
    const key = `${m.listing_id}:${other.id}`;
    const t = map.get(key) ?? { key, listingId: m.listing_id, listingTitle: m.listing_title, other, messages: [], unread: 0 };
    t.messages.push(m);
    if (m.recipient.id === meId && !m.read_at) t.unread++;
    map.set(key, t);
  }
  const threads = [...map.values()];
  threads.forEach((t) => t.messages.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id));
  return threads.sort((a, b) => b.messages.at(-1)!.created_at.localeCompare(a.messages.at(-1)!.created_at));
}

export function MessagesTab({ meId }: { meId: number }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesApi.list().then(setMessages).catch(() => setMessages([]));
  }, []);

  const threads = useMemo(() => (messages ? toThreads(messages, meId) : []), [messages, meId]);
  const active = threads.find((t) => t.key === activeKey) ?? null;

  // Mark incoming messages read when a conversation is opened.
  useEffect(() => {
    if (!active) return;
    const unread = active.messages.filter((m) => m.recipient.id === meId && !m.read_at);
    if (!unread.length) return;
    const now = new Date().toISOString();
    Promise.allSettled(unread.map((m) => messagesApi.markRead(m.id))).then(() =>
      setMessages((list) => list?.map((m) => (unread.some((u) => u.id === m.id) ? { ...m, read_at: now } : m)) ?? null),
    );
  }, [active, meId]);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [active?.messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      const last = active.messages[active.messages.length - 1];
      const sent = await messagesApi.reply(last.id, draft.trim());
      setMessages((list) => [sent, ...(list ?? [])]);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send message");
    } finally {
      setSending(false);
    }
  };

  if (!messages) return <Skeleton className="h-96 rounded-2xl" />;
  if (!threads.length) {
    return <EmptyState icon={MessageSquare} title="No messages yet" body="Conversations with buyers and sellers appear here." />;
  }

  return (
    <div className="glass grid min-h-[28rem] overflow-hidden rounded-2xl md:grid-cols-[300px_1fr]">
      <ul className={clsx("divide-y divide-line/60 border-line/60 md:border-r", active && "hidden md:block")} aria-label="Conversations">
        {threads.map((t) => {
          const last = t.messages[t.messages.length - 1];
          return (
            <li key={t.key}>
              <button type="button" onClick={() => setActiveKey(t.key)} aria-current={t.key === activeKey || undefined}
                className={clsx("w-full p-4 text-left transition-colors hover:bg-elevated/60", t.key === activeKey && "bg-elevated")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{t.other.full_name}</p>
                  {t.unread > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white" aria-label={`${t.unread} unread`}>
                      {t.unread}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-accent">{t.listingTitle}</p>
                <p className="mt-1 truncate text-xs text-muted">{last.body}</p>
              </button>
            </li>
          );
        })}
      </ul>

      {active ? (
        <div className="flex min-h-[28rem] flex-col">
          <div className="flex items-center gap-3 border-b border-line/60 p-4">
            <button type="button" onClick={() => setActiveKey(null)} className="rounded-lg p-1 hover:bg-elevated md:hidden" aria-label="Back to conversations">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="font-semibold">{active.other.full_name}</p>
              <Link href={`/cars/${active.listingId}`} className="block truncate text-xs text-accent hover:underline">{active.listingTitle}</Link>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {active.messages.map((m) => {
              const mine = m.sender.id === meId;
              return (
                <div key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-sm bg-accent text-white" : "rounded-bl-sm bg-elevated")}>
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                    <p className={clsx("mt-1 text-[10px]", mine ? "text-white/70" : "text-muted")}>{timeAgo(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-line/60 p-3">
            <label htmlFor="reply" className="sr-only">Reply</label>
            <input id="reply" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Write a reply…"
              className="h-11 flex-1 rounded-xl border border-line bg-elevated/60 px-4 text-sm focus:border-accent focus:outline-none" />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Send reply"
              className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-white disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="hidden place-items-center p-8 text-sm text-muted md:grid">Select a conversation</div>
      )}
    </div>
  );
}

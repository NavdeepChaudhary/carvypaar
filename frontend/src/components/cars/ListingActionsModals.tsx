"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, TextArea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { listingsApi } from "@/lib/listings";
import type { ListingDetail } from "@/lib/types";

interface Props {
  car: ListingDetail;
  open: boolean;
  onClose: () => void;
}

export function MakeOfferModal({ car, open, onClose }: Props) {
  const suggested = Math.round((car.price * 0.95) / 5000) * 5000;
  const [amount, setAmount] = useState(String(suggested));
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(suggested));
      setError(null);
    }
  }, [open, suggested]);

  const value = Number(amount);
  const pct = value > 0 ? Math.round((value / car.price) * 100) : 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSending(true);
    try {
      await listingsApi.makeOffer(car.id, value, message.trim() || undefined);
      toast.success("Offer sent! The seller has been notified.");
      setMessage("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send offer");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Make an offer" description={<>Asking price {formatPrice(car.price)}</>}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Input
          label="Your offer (₹)"
          type="number"
          inputMode="numeric"
          min={1}
          step={1000}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          error={error}
          hint={value > 0 ? `${formatPrice(value)} · ${pct}% of asking` : undefined}
        />
        <TextArea
          label="Message (optional)"
          value={message}
          maxLength={1000}
          placeholder="Cash buyer, can inspect this weekend…"
          onChange={(e) => setMessage(e.target.value)}
          hint={`${message.length}/1000`}
        />
        <p className="text-xs text-muted">
          A new offer replaces any pending offer you&apos;ve made on this car. Offers aren&apos;t binding until you and the seller agree.
        </p>
        <Button type="submit" size="lg" className="w-full" loading={sending}>
          Send offer
        </Button>
      </form>
    </Modal>
  );
}

export function ContactSellerModal({ car, open, onClose }: Props) {
  const defaultBody = `Hi ${car.seller.full_name.split(" ")[0]}, is your ${car.year} ${car.make} ${car.model} still available?`;
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setBody(defaultBody);
  }, [open, defaultBody]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await listingsApi.contactSeller(car.id, body.trim());
      toast.success("Message sent. Replies show up in your garage.");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Contact seller" description={<>Message {car.seller.full_name} about this car</>}>
      <form onSubmit={onSubmit} className="space-y-5">
        <TextArea
          label="Message"
          value={body}
          maxLength={2000}
          required
          rows={5}
          onChange={(e) => setBody(e.target.value)}
          hint={`${body.length}/2000`}
        />
        <Button type="submit" size="lg" className="w-full" loading={sending} disabled={!body.trim()}>
          Send message
        </Button>
      </form>
    </Modal>
  );
}

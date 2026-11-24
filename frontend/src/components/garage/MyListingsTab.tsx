"use client";

import { CarFront, Eye, EyeOff, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CarCard, CarCardSkeleton } from "@/components/cars/CarCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { listingsApi } from "@/lib/listings";
import type { ListingCard } from "@/lib/types";

export function MyListingsTab({ canSell }: { canSell: boolean }) {
  const [items, setItems] = useState<ListingCard[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ListingCard | null>(null);

  useEffect(() => {
    listingsApi.mine().then(setItems).catch(() => setItems([]));
  }, []);

  const setStatus = async (car: ListingCard, status: "active" | "inactive" | "sold") => {
    setBusyId(car.id);
    try {
      const updated = await listingsApi.update(car.id, { status });
      setItems((list) => list?.map((c) => (c.id === car.id ? { ...c, status: updated.status } : c)) ?? null);
      toast.success(status === "sold" ? "Congrats on the sale! 🎉" : status === "active" ? "Listing is live again" : "Listing hidden");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update listing");
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const car = confirmDelete;
    setBusyId(car.id);
    try {
      await listingsApi.remove(car.id);
      setItems((list) => list?.filter((c) => c.id !== car.id) ?? null);
      toast.success("Listing deleted");
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete listing");
    } finally {
      setBusyId(null);
    }
  };

  if (!items) {
    return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <CarCardSkeleton key={i} />)}</div>;
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={CarFront}
        title="No listings yet"
        body={canSell ? "List your first car in a few minutes." : "Enable selling to list your first car."}
        action={<Link href="/sell" className="rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent hover:shadow-glow">Sell a car</Link>}
      />
    );
  }

  const action = "flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold transition-colors hover:border-accent hover:text-ink disabled:opacity-50";

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Link href="/sell" className="flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent hover:shadow-glow">
          <Plus className="h-4 w-4" aria-hidden /> New listing
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((car, i) => (
          <CarCard
            key={car.id}
            car={car}
            index={i}
            showStatus
            footer={
              <div className="flex flex-wrap gap-2">
                <Link href={`/cars/${car.id}/edit`} className={action}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</Link>
                {car.status === "active" && (
                  <>
                    <button type="button" className={action} disabled={busyId === car.id} onClick={() => setStatus(car, "inactive")}>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden /> Hide
                    </button>
                    <button type="button" className={action} disabled={busyId === car.id} onClick={() => setStatus(car, "sold")}>
                      <Tag className="h-3.5 w-3.5" aria-hidden /> Sold
                    </button>
                  </>
                )}
                {(car.status === "inactive" || car.status === "sold") && (
                  <button type="button" className={action} disabled={busyId === car.id} onClick={() => setStatus(car, "active")}>
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Relist
                  </button>
                )}
                <button type="button" className={`${action} hover:!border-accent hover:!text-ink`} disabled={busyId === car.id}
                  onClick={() => setConfirmDelete(car)} aria-label={`Delete ${car.title}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            }
          />
        ))}
      </div>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete listing?"
        description={confirmDelete ? <>“{confirmDelete.title}” and its photos will be permanently removed.</> : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button onClick={doDelete} loading={busyId === confirmDelete?.id}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}

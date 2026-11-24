"use client";

import { ArrowLeft, Car } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ListingForm } from "@/components/cars/ListingForm";
import { RemotePhotoManager } from "@/components/cars/PhotoManager";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { ApiError } from "@/lib/api";
import { listingsApi } from "@/lib/listings";
import type { ListingDetail, ListingInput } from "@/lib/types";

export default function EditListingPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const router = useRouter();
  const { user, ready } = useRequireAuth();
  const [car, setCar] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    listingsApi
      .get(id)
      .then((c) => {
        if (!c.is_owner && user?.role !== "admin") setError("You can only edit your own listings.");
        else setCar(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load listing"));
  }, [id, ready, user?.role]);

  if (error) {
    return (
      <div className="container-page pb-20 pt-10">
        <EmptyState icon={Car} title="Can't edit this listing" body={error}
          action={<Link href="/garage" className="rounded-xl bg-accent px-6 py-3 font-semibold text-on-accent">Go to my garage</Link>} />
      </div>
    );
  }

  if (!car) {
    return (
      <div className="container-page max-w-4xl space-y-6 pb-20 pt-10" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const onSubmit = async (data: ListingInput) => {
    try {
      await listingsApi.update(car.id, data);
      toast.success("Listing updated");
      router.push(`/cars/${car.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save changes");
    }
  };

  return (
    <div className="container-page max-w-4xl pb-20 pt-10">
      <Link href={`/cars/${car.id}`} className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to listing
      </Link>
      <h1 className="font-display text-3xl font-extrabold uppercase sm:text-4xl">Edit listing</h1>

      <section className="glass mt-8 space-y-5 rounded-2xl p-6" aria-labelledby="photos-heading">
        <div>
          <h2 id="photos-heading" className="font-display text-lg font-bold uppercase tracking-wide">Photos</h2>
          <p className="mt-1 text-sm text-muted">Changes to photos save instantly. The first photo is the cover.</p>
        </div>
        <RemotePhotoManager listingId={car.id} images={car.images} onChange={(images) => setCar({ ...car, images })} />
      </section>

      <div className="mt-6">
        <ListingForm initial={car} submitLabel="Save changes" onSubmit={onSubmit} />
      </div>
    </div>
  );
}

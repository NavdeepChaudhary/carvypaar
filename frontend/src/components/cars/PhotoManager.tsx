"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { MAX_PHOTOS } from "@/lib/constants";
import { listingsApi } from "@/lib/listings";
import type { ListingImage } from "@/lib/types";

import { PhotoDropzone } from "./PhotoDropzone";
import { PhotoTile, moveItem } from "./PhotoTile";
import { partitionFiles } from "./photos";

/** Local (not yet uploaded) photos, used on the Sell page before the listing exists. */
export function LocalPhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u)); // free memory
  }, [files]);

  const add = (incoming: File[]) => {
    const { ok, errors } = partitionFiles(incoming, MAX_PHOTOS - files.length);
    errors.forEach((e) => toast.error(e));
    if (ok.length) onChange([...files, ...ok]);
  };

  return (
    <div className="space-y-4">
      {files.length < MAX_PHOTOS && <PhotoDropzone onFiles={add} remaining={MAX_PHOTOS - files.length} />}
      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Selected photos">
          {previews.map((src, i) => (
            <PhotoTile
              key={src}
              src={src}
              index={i}
              count={files.length}
              onMove={(from, to) => onChange(moveItem(files, from, to))}
              onDelete={() => onChange(files.filter((_, idx) => idx !== i))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Photos of an existing listing: uploads, deletes and reorders hit the API immediately. */
export function RemotePhotoManager({
  listingId,
  images,
  onChange,
}: {
  listingId: number;
  images: ListingImage[];
  onChange: (images: ListingImage[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Photo update failed");
    } finally {
      setBusy(null);
    }
  };

  const upload = (incoming: File[]) => {
    const { ok, errors } = partitionFiles(incoming, MAX_PHOTOS - images.length);
    errors.forEach((e) => toast.error(e));
    if (!ok.length) return;
    void run(`Uploading ${ok.length} photo${ok.length === 1 ? "" : "s"}…`, async () => {
      onChange(await listingsApi.uploadImages(listingId, ok));
      toast.success("Photos uploaded");
    });
  };

  const move = (from: number, to: number) => {
    const reordered = moveItem(images, from, to);
    const previous = images;
    onChange(reordered); // optimistic
    void run("Saving order…", async () => {
      try {
        onChange(await listingsApi.reorderImages(listingId, reordered.map((i) => i.id)));
      } catch (err) {
        onChange(previous);
        throw err;
      }
    });
  };

  const remove = (image: ListingImage) =>
    void run("Deleting…", async () => {
      await listingsApi.deleteImage(listingId, image.id);
      onChange(images.filter((i) => i.id !== image.id).map((img, pos) => ({ ...img, position: pos })));
    });

  return (
    <div className="space-y-4">
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {busy}
        </p>
      )}
      {images.length < MAX_PHOTOS && (
        <PhotoDropzone onFiles={upload} disabled={!!busy} remaining={MAX_PHOTOS - images.length} />
      )}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Listing photos">
          {images.map((img, i) => (
            <PhotoTile
              key={img.id}
              src={img.url}
              index={i}
              count={images.length}
              disabled={!!busy}
              onMove={move}
              onDelete={() => remove(img)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

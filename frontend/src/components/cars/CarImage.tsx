"use client";

import { clsx } from "clsx";
import { CarFront } from "lucide-react";
import { useState } from "react";

/**
 * Listing photo with a branded fallback when the URL is missing or broken.
 * Plain <img> because photos come from arbitrary storage backends/CDNs.
 */
export function CarImage({
  src,
  alt,
  className,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={clsx("grid place-items-center bg-gradient-to-br from-elevated to-surface text-muted", className)}
      >
        <CarFront className="h-1/3 max-h-16 w-1/3 max-w-16 opacity-40" aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={clsx("object-cover", className)}
    />
  );
}

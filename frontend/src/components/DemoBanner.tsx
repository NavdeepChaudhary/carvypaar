"use client";

import { Info, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DEMO_MESSAGE, STATIC_DEMO } from "@/lib/api";

const KEY = "cv-demo-banner-dismissed";

/** Shown only in the GitHub Pages preview build, which has no backend server. */
export function DemoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!STATIC_DEMO) return;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* storage blocked: show it */
    }
    setVisible(!dismissed);
  }, []);

  if (!visible) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[70] border-t border-amber-500/40 bg-amber-950/95 px-4 py-3 text-amber-100 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-start gap-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <p className="flex-1">
          <strong className="font-semibold">Preview mode.</strong> {DEMO_MESSAGE}
        </p>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            try {
              sessionStorage.setItem(KEY, "1");
            } catch {
              /* ignore */
            }
          }}
          className="rounded-lg p-1 text-amber-300 hover:bg-amber-500/20"
          aria-label="Dismiss preview notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

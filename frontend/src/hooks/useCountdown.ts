"use client";

import { useEffect, useState } from "react";

export interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function splitMs(ms: number): CountdownParts {
  const clamped = Math.max(0, ms);
  const s = Math.floor(clamped / 1000);
  return {
    totalMs: clamped,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: clamped <= 0,
  };
}

/**
 * Live countdown to `targetMs` (epoch ms). `offsetMs` = serverTime - clientTime,
 * so a user with a wrong system clock still sees the correct time remaining.
 */
export function useCountdown(targetMs: number, offsetMs = 0): CountdownParts {
  const compute = () => splitMs(targetMs - (Date.now() + offsetMs));
  const [parts, setParts] = useState<CountdownParts>(compute);

  useEffect(() => {
    setParts(compute());
    const id = window.setInterval(() => setParts(compute()), 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs, offsetMs]);

  return parts;
}

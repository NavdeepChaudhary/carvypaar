"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Page transitions. A template (unlike a layout) re-mounts on every navigation,
 * so each page fades and lifts in.
 *
 * * `initial` must be identical on server and client (no useReducedMotion() branch
 *   here): React doesn't patch style mismatches after hydration. Reduced-motion users
 *   are handled by <MotionConfig reducedMotion="user"> in Providers, which skips the
 *   movement and keeps only the fade.
 * * Only opacity/transform are animated: a lingering CSS `filter` on this wrapper
 *   would make it the containing block for every `position: fixed` child.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" richColors closeButton />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": every framer-motion animation honours the OS
    // "reduce motion" setting (the CSS media query alone doesn't affect JS animations).
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          {children}
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

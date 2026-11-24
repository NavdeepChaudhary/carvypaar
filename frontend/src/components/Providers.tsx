"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY, clerkAppearance } from "@/lib/clerk";

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" richColors closeButton />;
}

/** Clerk's provider, styled for the current theme. Sits inside ThemeProvider, outside AuthProvider. */
function SignInProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  if (!CLERK_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={clerkAppearance(theme)}
      signInUrl="/login"
      signUpUrl="/register"
      afterSignOutUrl="/"
      telemetry={false}
    >
      {children}
    </ClerkProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": every framer-motion animation honours the OS
    // "reduce motion" setting (the CSS media query alone doesn't affect JS animations).
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <SignInProvider>
          <AuthProvider>
            {children}
            <ThemedToaster />
          </AuthProvider>
        </SignInProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

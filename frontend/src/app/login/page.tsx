"use client";

import { Suspense } from "react";

import { AuthCard } from "@/components/AuthCard";
import { ClerkAuthForm } from "@/components/auth/ClerkAuthForm";

export default function LoginPage() {
  return (
    <AuthCard eyebrow="Ignition" title="Start your engine" subtitle="Sign in to get back to your garage, saved cars and live bids.">
      <Suspense fallback={null}>
        <ClerkAuthForm mode="sign-in" />
      </Suspense>
    </AuthCard>
  );
}

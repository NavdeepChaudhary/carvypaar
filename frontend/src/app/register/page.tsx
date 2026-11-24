"use client";

import { Suspense } from "react";

import { AuthCard } from "@/components/AuthCard";
import { ClerkAuthForm } from "@/components/auth/ClerkAuthForm";

export default function RegisterPage() {
  return (
    <AuthCard
      eyebrow="Your keys"
      title="Join the CarvyPaar garage"
      subtitle="Buy, sell and bid on the cars you love. Want to sell? Switch to a seller account any time from the Sell page."
    >
      <Suspense fallback={null}>
        <ClerkAuthForm mode="sign-up" />
      </Suspense>
    </AuthCard>
  );
}

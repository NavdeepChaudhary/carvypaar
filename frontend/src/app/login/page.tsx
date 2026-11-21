"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AuthCard } from "@/components/AuthCard";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { navigateAfterAuth, safeNext } from "@/lib/navigation";
import { EMAIL_RE } from "@/lib/validation";

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Skip the form.
  useEffect(() => {
    if (!loading && user) navigateAfterAuth(router, next, "/login");
  }, [loading, user, next, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) nextErrors.email = "Enter a valid email";
    if (!password) nextErrors.password = "Enter your password";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      toast.success(`Welcome back, ${u.full_name.split(" ")[0]}!`);
      navigateAfterAuth(router, next, "/login");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong";
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <GoogleSignInButton
        onSignedIn={(u) => {
          toast.success(`Welcome, ${u.full_name.split(" ")[0]}!`);
          navigateAfterAuth(router, next, "/login");
        }}
      />
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {errors.form && (
        <div role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          {errors.form}
        </div>
      )}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        placeholder="you@example.com"
        required
      />
      <PasswordInput
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        required
      />
      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" subtitle="Your garage, saved cars and bids are waiting.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

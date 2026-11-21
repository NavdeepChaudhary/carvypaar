"use client";

import { clsx } from "clsx";
import { Car, KeyRound } from "lucide-react";
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
import { EMAIL_RE, passwordError, passwordScore, phoneError } from "@/lib/validation";

type Role = "buyer" | "seller";
type Errors = Partial<Record<"full_name" | "email" | "password" | "confirm" | "phone" | "form", string>>;

const ROLES: { value: Role; label: string; desc: string; icon: typeof Car }[] = [
  { value: "buyer", label: "Buyer", desc: "Browse, save & bid", icon: Car },
  { value: "seller", label: "Seller", desc: "List & auction cars", icon: KeyRound },
];

const STRENGTH = ["Too weak", "Weak", "Okay", "Strong", "Very strong"];

function RegisterForm() {
  const { register, user, loading } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", phone: "" });
  const [role, setRole] = useState<Role>("buyer");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigateAfterAuth(router, next, "/register");
  }, [loading, user, next, router]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = (): Errors => {
    const errs: Errors = {};
    if (form.full_name.trim().length < 2) errs.full_name = "Enter your full name";
    if (!EMAIL_RE.test(form.email.trim())) errs.email = "Enter a valid email";
    const pwErr = passwordError(form.password);
    if (pwErr) errs.password = pwErr;
    if (form.password !== form.confirm) errs.confirm = "Passwords don't match";
    const phErr = phoneError(form.phone);
    if (phErr) errs.phone = phErr;
    return errs;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role,
        phone: form.phone.trim() || undefined,
      });
      toast.success("Account created. Welcome to CarvyPaar!");
      navigateAfterAuth(router, next, "/register");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong";
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const score = passwordScore(form.password);

  return (
    <>
      <GoogleSignInButton
        context="signup"
        onSignedIn={(u) => {
          toast.success(`Welcome to CarvyPaar, ${u.full_name.split(" ")[0]}!`);
          navigateAfterAuth(router, next, "/register");
        }}
      />
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {errors.form && (
        <div role="alert" className="whitespace-pre-line rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          {errors.form}
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">I want to</legend>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {ROLES.map(({ value, label, desc, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={clsx(
                "rounded-xl border p-3 text-left transition-all",
                role === value ? "border-accent bg-accent/10 shadow-glow" : "border-line hover:border-accent/50",
              )}
            >
              <Icon className={clsx("h-5 w-5", role === value ? "text-accent" : "text-muted")} aria-hidden />
              <p className="mt-2 text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted">{desc}</p>
            </button>
          ))}
        </div>
      </fieldset>

      <Input label="Full name" autoComplete="name" value={form.full_name} onChange={set("full_name")} error={errors.full_name} maxLength={120} required />
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} required />
      <Input
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        value={form.phone}
        onChange={set("phone")}
        error={errors.phone}
        placeholder="+91 98765 43210"
        maxLength={30}
      />
      <PasswordInput
        label="Password"
        autoComplete="new-password"
        value={form.password}
        onChange={set("password")}
        error={errors.password}
        maxLength={72}
        required
        hint={
          form.password ? (
            <div className="flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={clsx("h-1 flex-1 rounded-full", i < score ? "bg-accent" : "bg-line")} />
                ))}
              </div>
              <span>{STRENGTH[score]}</span>
            </div>
          ) : (
            "8+ characters with letters and numbers"
          )
        }
      />
      <PasswordInput label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} error={errors.confirm} required />

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
    </>
  );
}

export default function RegisterPage() {
  return (
    <AuthCard title="Join CarvyPaar" subtitle="Buy, sell and bid on the cars you love.">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}

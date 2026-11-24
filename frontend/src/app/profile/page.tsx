"use client";

import { motion } from "framer-motion";
import { CalendarDays, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, TextArea } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { passwordError, phoneError } from "@/lib/validation";

function ProfileSkeleton() {
  return (
    <div className="container-page grid gap-6 pb-20 pt-10 lg:grid-cols-3" aria-busy="true" aria-label="Loading profile">
      <Skeleton className="h-80 rounded-2xl" />
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function ProfileCard({ user }: { user: User }) {
  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const since = new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <motion.aside initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass h-fit rounded-2xl p-6">
      <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-deep font-display text-2xl font-extrabold text-on-accent shadow-glow">
        {initials}
      </div>
      <h1 className="mt-4 font-display text-xl font-bold">{user.full_name}</h1>
      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {user.role}
      </span>
      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex items-center gap-3 text-muted">
          <Mail className="h-4 w-4" aria-hidden />
          <dt className="sr-only">Email</dt>
          <dd className="truncate text-fg">{user.email}</dd>
        </div>
        {user.phone && (
          <div className="flex items-center gap-3 text-muted">
            <Phone className="h-4 w-4" aria-hidden />
            <dt className="sr-only">Phone</dt>
            <dd className="text-fg">{user.phone}</dd>
          </div>
        )}
        {user.location && (
          <div className="flex items-center gap-3 text-muted">
            <MapPin className="h-4 w-4" aria-hidden />
            <dt className="sr-only">Location</dt>
            <dd className="text-fg">{user.location}</dd>
          </div>
        )}
        <div className="flex items-center gap-3 text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden />
          <dt className="sr-only">Member since</dt>
          <dd>Member since {since}</dd>
        </div>
      </dl>
      {user.bio && <p className="mt-6 border-t border-line pt-4 text-sm leading-relaxed text-muted">{user.bio}</p>}
    </motion.aside>
  );
}

function EditProfileForm({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone ?? "",
    location: user.location ?? "",
    bio: user.bio ?? "",
  });
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (form.full_name.trim().length < 2) errs.full_name = "Enter your full name";
    const ph = phoneError(form.phone);
    if (ph) errs.phone = ph;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await updateProfile(form);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.form
      onSubmit={onSubmit}
      noValidate
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="glass space-y-5 rounded-2xl p-6"
    >
      <h2 className="font-display text-lg font-bold uppercase tracking-wide">Edit profile</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="Full name" value={form.full_name} maxLength={120} error={errors.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Input label="Phone" type="tel" value={form.phone} maxLength={30} error={errors.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <Input label="Location" value={form.location} maxLength={120} placeholder="City, State"
        onChange={(e) => setForm({ ...form, location: e.target.value })} />
      <TextArea label="Bio" value={form.bio} maxLength={2000} placeholder="Tell other enthusiasts about your garage..."
        hint={`${form.bio.length}/2000`} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Save changes</Button>
      </div>
    </motion.form>
  );
}

function ChangePasswordForm() {
  const { changePassword, user } = useAuth();
  // Google-only accounts have no password yet: let them set one (no "current" field).
  const settingFirst = user ? !user.has_password : false;
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!settingFirst && !form.current) errs.current = "Enter your current password";
    const pw = passwordError(form.next);
    if (pw) errs.next = pw;
    if (form.next !== form.confirm) errs.confirm = "Passwords don't match";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      toast.success(settingFirst ? "Password set. You can now also sign in with email." : "Password changed. Other devices were signed out.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.form
      onSubmit={onSubmit}
      noValidate
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass space-y-5 rounded-2xl p-6"
    >
      <h2 className="font-display text-lg font-bold uppercase tracking-wide">{settingFirst ? "Set a password" : "Change password"}</h2>
      {settingFirst ? (
        <p className="text-sm text-muted">You signed up with Google. Add a password to also sign in with your email.</p>
      ) : (
        <PasswordInput label="Current password" autoComplete="current-password" value={form.current} error={errors.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })} />
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <PasswordInput label="New password" autoComplete="new-password" value={form.next} error={errors.next} maxLength={72}
          onChange={(e) => setForm({ ...form, next: e.target.value })} />
        <PasswordInput label="Confirm new password" autoComplete="new-password" value={form.confirm} error={errors.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="outline" loading={saving}>{settingFirst ? "Set password" : "Update password"}</Button>
      </div>
    </motion.form>
  );
}

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/profile");
  }, [loading, user, router]);

  if (loading || !user) return <ProfileSkeleton />;

  return (
    <div className="container-page grid gap-6 pb-20 pt-10 lg:grid-cols-3">
      <ProfileCard user={user} />
      <div className="space-y-6 lg:col-span-2">
        {/* key resets the form when the saved profile changes */}
        <EditProfileForm key={user.id} user={user} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}

/** Client-side validation mirroring the backend rules (server remains the source of truth). */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

export function passwordError(pw: string): string | null {
  if (pw.length < 8) return "At least 8 characters";
  if (new TextEncoder().encode(pw).length > 72) return "At most 72 bytes";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number";
  return null;
}

export function phoneError(phone: string): string | null {
  if (!phone.trim()) return null;
  return PHONE_RE.test(phone.trim()) ? null : "Enter a valid phone number";
}

/** 0–4 strength score for the password meter. */
export function passwordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

/** Client-side validation mirroring the backend rules (server remains the source of truth). */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

export function phoneError(phone: string): string | null {
  if (!phone.trim()) return null;
  return PHONE_RE.test(phone.trim()) ? null : "Enter a valid phone number";
}

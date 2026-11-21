import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_MB } from "@/lib/constants";

/** Client-side pre-check (the server re-validates and re-encodes every image). */
export function checkImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return `${file.name}: use JPEG, PNG or WebP`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `${file.name} is larger than ${MAX_UPLOAD_MB} MB`;
  return null;
}

/** Split files into accepted ones and error messages, respecting the remaining slots. */
export function partitionFiles(files: File[], slotsLeft: number): { ok: File[]; errors: string[] } {
  const ok: File[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const err = checkImageFile(f);
    if (err) errors.push(err);
    else if (ok.length >= slotsLeft) {
      errors.push(`Only ${slotsLeft} more photo${slotsLeft === 1 ? "" : "s"} allowed`);
      break;
    } else ok.push(f);
  }
  return { ok, errors };
}

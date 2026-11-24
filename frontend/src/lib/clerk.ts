import type { Theme } from "@/context/ThemeContext";

/** Clerk handles sign-up, sign-in, passwords, Google and email verification.
 *  Without a publishable key (e.g. the GitHub Pages preview) the site runs signed-out only. */
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
export const CLERK_ENABLED = CLERK_PUBLISHABLE_KEY.startsWith("pk_");

// The site's theme tokens (globals.css) as plain colours: Clerk derives hover and border
// shades from these, so they can't be CSS variables.
const PALETTE = {
  light: { bg: "#ffffff", fg: "#0b1630", muted: "#5c667a", input: "#eff1f5", border: "#e2e6ed", soft: "#f6f7f9" },
  dark: { bg: "#0f172c", fg: "#eef1f7", muted: "#96a0b6", input: "#18223c", border: "#243150", soft: "#080d1c" },
} as const;

/** Clerk's widgets, styled to match the site in either theme. */
export function clerkAppearance(theme: Theme) {
  const c = PALETTE[theme];
  return {
    variables: {
      colorPrimary: "#ffc107",
      colorPrimaryForeground: "#0b1630",
      colorBackground: c.bg,
      colorForeground: c.fg,
      colorMutedForeground: c.muted,
      colorMuted: c.soft,
      colorInput: c.input,
      colorInputForeground: c.fg,
      colorBorder: c.border,
      colorNeutral: c.fg,
      colorRing: "#ffc107",
      colorDanger: theme === "dark" ? "#f87171" : "#dc2626",
      borderRadius: "0.75rem",
      fontFamily: "var(--font-sans), system-ui, sans-serif",
    },
    elements: {
      rootBox: "w-full",
      cardBox: "w-full !shadow-none !border-0",
      card: "!shadow-none !bg-transparent !px-0 !pt-0",
      header: "hidden", // the page shows its own title
      socialButtonsBlockButton: "!h-11 !border !border-line hover:!border-accent",
      // The form's main button is a car's round ENGINE START push-button (text set in clerkLocalization).
      formButtonPrimary: [
        "!mx-auto !mt-2 !flex !h-28 !w-28 !flex-col !items-center !justify-center !rounded-full !px-3",
        "!whitespace-normal !text-center !text-[11px] !font-extrabold !uppercase !leading-tight !tracking-[0.18em]",
        "!bg-[radial-gradient(circle_at_32%_28%,#46516f,#0b1630_72%)] !text-white !transition !duration-200",
        "!shadow-[0_0_0_4px_#c3c9d6,0_0_0_8px_#0b1630,0_0_26px_6px_rgba(239,68,68,0.55)]",
        "hover:!shadow-[0_0_0_4px_#c3c9d6,0_0_0_8px_#0b1630,0_0_38px_12px_rgba(239,68,68,0.85)]",
        "active:!scale-95 [&_svg]:!hidden",
      ].join(" "),
      formFieldInput: "!h-11",
      footer: "!bg-none !bg-transparent",
      footerActionLink: "!font-semibold !text-ink hover:!underline",
    },
  };
}

/** Clerk's button text: the main button reads like a car's push-to-start button. */
export const clerkLocalization = { formButtonPrimary: "Start engine" };

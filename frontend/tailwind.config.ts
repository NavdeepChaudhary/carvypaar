import type { Config } from "tailwindcss";

/** Theme colours are CSS variables (see globals.css) so dark/light mode is one class swap. */
const withVar = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: withVar("bg"),
        surface: withVar("surface"),
        elevated: withVar("elevated"),
        fg: withVar("fg"),
        muted: withVar("muted"),
        line: withVar("line"),
        // Brand yellow: for fills (buttons, badges, highlights). Text on it uses `on-accent`.
        accent: {
          DEFAULT: withVar("accent"),
          soft: withVar("accent-soft"),
          deep: withVar("accent-deep"),
        },
        // Readable yellow/gold for text and icons on the page background.
        ink: withVar("ink"),
        "on-accent": withVar("on-accent"),
        // Secondary highlight (was cyan): deep blue in light mode, sky in dark.
        neon: withVar("neon"),
        // Fixed navy for the top bar, footer and dark promo panels (same in both themes).
        navy: {
          DEFAULT: "#0b1630",
          soft: "#14234a",
          line: "#22335e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 10px 30px -10px rgba(245, 180, 0, 0.55)",
        "glow-cyan": "0 10px 30px -12px rgba(29, 78, 216, 0.45)",
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12)",
        lift: "0 2px 4px rgba(15, 23, 42, 0.05), 0 20px 40px -16px rgba(15, 23, 42, 0.22)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(245,180,0,0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(245,180,0,0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

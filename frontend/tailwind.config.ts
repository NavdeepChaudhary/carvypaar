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
        accent: {
          DEFAULT: "#ff1f3d", // electric red
          soft: "#ff4d64",
          deep: "#c8102e",
        },
        neon: "#00e5ff", // cyan highlight
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(255, 31, 61, 0.45)",
        "glow-cyan": "0 0 24px rgba(0, 229, 255, 0.35)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(255,31,61,0.35)" },
          "50%": { boxShadow: "0 0 28px rgba(255,31,61,0.75)" },
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

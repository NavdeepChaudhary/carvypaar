import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import type { ReactNode } from "react";

import { DemoBanner } from "@/components/DemoBanner";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Providers } from "@/components/Providers";
import { themeInitScript } from "@/context/ThemeContext";

import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Poppins({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700", "800", "900"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "CarvyPaar | Buy, sell & auction cars", template: "%s · CarvyPaar" },
  description:
    "The car marketplace for enthusiasts. Buy, sell and bid on cars in live auctions, with AI price estimates on every listing.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080d1c" },
    { media: "(prefers-color-scheme: light)", color: "#0b1630" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        <Providers>
          <Navbar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <DemoBanner />
        </Providers>
      </body>
    </html>
  );
}

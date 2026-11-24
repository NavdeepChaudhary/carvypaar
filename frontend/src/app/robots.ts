import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or account-only pages: nothing useful for search results.
      disallow: ["/profile", "/garage", "/admin", "/sell", "/login", "/register", "/cars/*/edit", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

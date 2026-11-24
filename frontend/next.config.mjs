/** @type {import('next').NextConfig} */
// Two ways to reach the API:
//  * BACKEND_URL set (e.g. Vercel -> Render): "proxy mode". The browser calls /api on this
//    site and Next.js rewrites it to the backend, so the refresh cookie stays first-party.
//    WebSockets can't be proxied by Vercel, so they connect to the backend directly.
//  * otherwise NEXT_PUBLIC_API_URL ("" = same origin, e.g. behind Caddy; default localhost:8000).
//  * GITHUB_PAGES=true: a static, backend-less PREVIEW exported for GitHub Pages
//    (see .github/workflows/pages.yml). API features are disabled with a notice.
const isPages = process.env.GITHUB_PAGES === "true";
const basePath = isPages ? (process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "") : "";
const backendUrl = isPages ? null : process.env.BACKEND_URL?.replace(/\/$/, "") || null;
const rawApi = isPages || backendUrl ? "" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");
const wsDirect = backendUrl ? backendUrl.replace(/^http/, "ws") : "";
const apiUrl = rawApi ? new URL(rawApi) : null;
const isDev = process.env.NODE_ENV !== "production";
const backendOrigin = backendUrl ? new URL(backendUrl).origin : null;
// 'self' already covers same-origin requests (incl. ws/wss).
const apiOrigin = apiUrl ? ` ${apiUrl.origin}` : backendOrigin ? ` ${backendOrigin}` : ""; // photos are served by the backend
const wsOrigin = apiUrl ? ` ${apiUrl.origin.replace(/^http/, "ws")}` : wsDirect ? ` ${new URL(wsDirect).origin}` : "";
// Clerk (sign-in): its script and API live on the instance's "frontend API" host, which the
// publishable key encodes: pk_test_<base64("my-app.clerk.accounts.dev$")>.
function clerkFrontendApi(key) {
  try {
    const host = Buffer.from((key ?? "").split("_")[2] ?? "", "base64").toString().replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}
const clerkApi = clerkFrontendApi(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
// Clerk's bot protection: Cloudflare Turnstile plus its own "protect" script and endpoints.
const CLERK = clerkApi ? ` ${clerkApi} https://challenges.cloudflare.com https://cdn.protect.clerk.com` : "";
// The bot check probes several ports on its own hosts.
const CLERK_CONNECT = clerkApi ? ` ${clerkApi} https://*.protect.clerk.com https://*.protect.clerk.com:*` : "";

/**
 * Content Security Policy.
 * - Only our own origin and the API may be contacted (fetch + WebSocket).
 * - Images: self, the API's /uploads, Unsplash (demo photos), data:/blob: (upload previews).
 * - script-src needs 'unsafe-inline': Next.js injects inline bootstrap scripts, as does the
 *   no-flash theme initializer. Dropping it would require per-request nonces, which force
 *   every page into dynamic rendering. Dev additionally needs 'unsafe-eval' (React Refresh).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${CLERK}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `frame-src 'self'${CLERK}`, // Clerk's bot check
  "worker-src 'self' blob:", // Clerk runs a small worker to keep the session fresh
  `img-src 'self' data: blob: https://images.unsplash.com https://img.clerk.com${apiOrigin}`,
  "font-src 'self'",
  `connect-src 'self'${apiOrigin}${wsOrigin}${CLERK_CONNECT}${isDev ? " ws://localhost:3000 ws://127.0.0.1:3000" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // same-origin-allow-popups: Clerk's "Continue with Google" popup must be able to post its result back.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig = {
  output: "standalone", // small production Docker image
  // Inline the resolved API / WebSocket addresses into the browser bundle.
  env: { NEXT_PUBLIC_API_URL: rawApi, NEXT_PUBLIC_WS_URL: wsDirect },
  async rewrites() {
    return backendUrl
      ? [
          { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
          { source: "/uploads/:path*", destination: `${backendUrl}/uploads/:path*` },
        ]
      : [];
  },
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Listing photos served by the API (local storage in dev).
      ...(apiUrl
        ? [{ protocol: apiUrl.protocol.replace(":", ""), hostname: apiUrl.hostname, port: apiUrl.port, pathname: "/uploads/**" }]
        : []),
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// GitHub Pages serves plain files: no server, so no rewrites or custom headers (and the
// security headers/CSP above can't be applied there; that's a host limitation).
const pagesConfig = {
  output: "export",
  basePath,
  trailingSlash: true, // /cars/ -> cars/index.html, which GitHub Pages serves natively
  reactStrictMode: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_URL: "",
    NEXT_PUBLIC_WS_URL: "",
    NEXT_PUBLIC_STATIC_DEMO: "1",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "", // no sign-in in the backend-less preview
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default isPages ? pagesConfig : nextConfig;

/** @type {import('next').NextConfig} */
// Two ways to reach the API:
//  * BACKEND_URL set (e.g. Vercel -> Render): "proxy mode". The browser calls /api on this
//    site and Next.js rewrites it to the backend, so the refresh cookie stays first-party.
//    WebSockets can't be proxied by Vercel, so they connect to the backend directly.
//  * otherwise NEXT_PUBLIC_API_URL ("" = same origin, e.g. behind Caddy; default localhost:8000).
const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, "") || null;
const rawApi = backendUrl ? "" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");
const wsDirect = backendUrl ? backendUrl.replace(/^http/, "ws") : "";
const apiUrl = rawApi ? new URL(rawApi) : null;
const isDev = process.env.NODE_ENV !== "production";
const backendOrigin = backendUrl ? new URL(backendUrl).origin : null;
// 'self' already covers same-origin requests (incl. ws/wss).
const apiOrigin = apiUrl ? ` ${apiUrl.origin}` : backendOrigin ? ` ${backendOrigin}` : ""; // photos are served by the backend
const wsOrigin = apiUrl ? ` ${apiUrl.origin.replace(/^http/, "ws")}` : wsDirect ? ` ${new URL(wsDirect).origin}` : "";
const GOOGLE = "https://accounts.google.com"; // Google Identity Services (sign-in button)

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
  `script-src 'self' 'unsafe-inline' ${GOOGLE}${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline' ${GOOGLE}`,
  `frame-src ${GOOGLE}`, // the Google sign-in button and popup
  `img-src 'self' data: blob: https://images.unsplash.com${apiOrigin}`,
  "font-src 'self'",
  `connect-src 'self'${apiOrigin}${wsOrigin} ${GOOGLE}${isDev ? " ws://localhost:3000 ws://127.0.0.1:3000" : ""}`,
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
  // same-origin-allow-popups: the Google sign-in popup must be able to post its result back.
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

export default nextConfig;

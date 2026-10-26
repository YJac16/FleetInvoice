import type { NextConfig } from "next";

const securityHeaders = [
  // Block framing (clickjacking) and plugin/base-tag abuse without restricting scripts.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Camera for document scans and QR; location for driver GPS.
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

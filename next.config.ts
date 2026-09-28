import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
function clerkFrontendOrigin() {
  const key =
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  try {
    const encoded = key?.split("_")[2];
    if (!encoded) return null;
    const domain = Buffer.from(encoded, "base64url")
      .toString("utf8")
      .replace(/\$$/, "");
    if (
      !/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(domain) ||
      domain.includes("..")
    )
      return null;
    return `https://${domain}`;
  } catch {
    return null;
  }
}

const clerkOrigin = clerkFrontendOrigin();
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://*.protect.clerk.com${clerkOrigin ? ` ${clerkOrigin}` : ""}`,
  "script-src-attr 'none'",
  `connect-src 'self'${isDevelopment ? " ws: wss:" : ""} http://127.0.0.1:8765 https://*.api.radio-browser.info https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.stripe.com https://maps.googleapis.com https://img.clerk.com https://*.protect.clerk.com:*${clerkOrigin ? ` ${clerkOrigin}` : ""}`,
  "img-src 'self' data: blob: https://img.clerk.com",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@clerk/backend"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Other sites cannot frame the cabin to trick clicks on its controls.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          ...(isDevelopment
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000",
                },
              ]),
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/index.html", destination: "/", permanent: true }];
  },
};

export default nextConfig;

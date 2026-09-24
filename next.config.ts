import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@clerk/backend"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
  async redirects() {
    return [{ source: "/index.html", destination: "/", permanent: true }];
  },
};

export default nextConfig;

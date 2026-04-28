import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Vercel function regions: Singapore for VN latency
  // (set in vercel.json instead — see /vercel.json)
};

export default nextConfig;

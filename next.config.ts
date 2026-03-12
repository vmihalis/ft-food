import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.lumacdn.com",
      },
    ],
  },
};

export default nextConfig;

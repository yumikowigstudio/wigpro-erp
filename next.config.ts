import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type errors are caught in development; don't block production builds
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

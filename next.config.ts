import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type errors are caught in development; don't block production builds
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint runs separately in CI; don't block production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

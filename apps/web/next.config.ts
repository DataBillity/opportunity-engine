import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@opportunity-engine/core",
    "@opportunity-engine/contracts",
    "@opportunity-engine/db",
  ],
};

export default nextConfig;

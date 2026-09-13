import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  transpilePackages: [
    "@opportunity-engine/core",
    "@opportunity-engine/contracts",
    "@opportunity-engine/ai",
    "@opportunity-engine/db",
  ],
  serverExternalPackages: [
    "unpdf",
    "pdfjs-dist",
    "mammoth",
    "@neondatabase/serverless",
    "drizzle-orm",
  ],
};

export default nextConfig;

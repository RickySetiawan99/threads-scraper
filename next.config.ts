import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core', 'bullmq', 'ioredis'],
};

export default nextConfig;

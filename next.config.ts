import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core', 'bullmq', 'ioredis'],
  async headers() {
    return [
      {
        // Prevent Hostinger CDN / Edge Cache from serving stale HTML
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

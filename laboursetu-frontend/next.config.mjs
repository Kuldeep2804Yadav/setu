/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  reactStrictMode: true,
  async rewrites() {
    // When API_SERVER_URL is configured (e.g., Render backend URL in Vercel environment),
    // proxy /api/v1 calls so browser cookies operate as first-party (SameSite=Lax).
    const apiUrl = process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl && !apiUrl.startsWith('/')) {
      const cleanBase = apiUrl.replace(/\/api\/v1\/?$/, '');
      return [
        {
          source: '/api/v1/:path*',
          destination: `${cleanBase}/api/v1/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;

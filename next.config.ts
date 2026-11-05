import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
  experimental: { serverActions: { bodySizeLimit: '64kb' } },
  // Keep isolated fixture review separate from an already-running user server.
  distDir: process.env.ANIME_PREVIEW_FIXTURES === '1' && process.env.NODE_ENV !== 'production' ? '.next-review' : process.env.ANIME_BUILD_DIR === '.next-build' ? '.next-build' : '.next',
};

export default nextConfig;

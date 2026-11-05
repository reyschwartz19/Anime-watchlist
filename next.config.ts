import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep isolated fixture review separate from an already-running user server.
  distDir: process.env.ANIME_PREVIEW_FIXTURES === '1' && process.env.NODE_ENV !== 'production' ? '.next-review' : process.env.ANIME_BUILD_DIR === '.next-build' ? '.next-build' : '.next',
};

export default nextConfig;

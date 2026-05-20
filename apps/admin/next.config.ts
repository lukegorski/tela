import type { NextConfig } from 'next';

const config: NextConfig = {
  // Transpile workspace packages we consume directly. @tela/api is a type-only
  // import (AppRouter), but Next still requires it listed here for the
  // experimental.externalDir resolution to work. @tela/db is consumed at
  // runtime by admin lib helpers via getSql() / getDb().
  transpilePackages: ['@tela/api', '@tela/db'],
  experimental: {
    externalDir: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

export default config;

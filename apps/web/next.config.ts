import type { NextConfig } from 'next';

const config: NextConfig = {
  // Allow workspace packages to be transpiled (the tela monorepo dependencies)
  transpilePackages: ['@tela/api'],
  experimental: {
    // Required for our co-located workspace structure
    externalDir: true,
  },
  images: {
    // Allow next/image to load from any Supabase Storage bucket on any
    // Supabase project (dev/staging/prod). All ported components use
    // <Image> with signed URLs from /storage/v1/object/sign/... and
    // public URLs from /storage/v1/object/public/...; without this
    // allowlist next/image throws "Invalid src prop ... hostname not
    // configured" and the React tree errors out.
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

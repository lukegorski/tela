import type { NextConfig } from 'next';

const config: NextConfig = {
  // Allow workspace packages to be transpiled (the tela monorepo dependencies)
  transpilePackages: ['@tela/api'],
  experimental: {
    // Required for our co-located workspace structure
    externalDir: true,
  },
};

export default config;

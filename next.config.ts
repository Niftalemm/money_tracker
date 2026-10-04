import type { NextConfig } from 'next';
import { validatePublicConfig } from './src/lib/public-config';
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    throw new Error(
      'Configure both public Supabase variables, or neither for the demo.',
    );
  validatePublicConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { useTypeScriptCli: false },
  async headers() {
    return [
      {
        source: '/pdf-import.worker.mjs',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'",
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};
export default config;

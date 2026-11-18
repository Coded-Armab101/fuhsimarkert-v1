import type { NextConfig } from 'next';

/**
 * In production the security headers are delivered by Vercel's edge router via
 * `vercel.json`, which also covers Vercel-internal routes such as
 * `/.well-known/vercel/security/request-challenge` that never reach Next.js.
 *
 * Locally (`next dev` / `next start`) `vercel.json` is not read, so we add the
 * same header here for development only. It includes `'unsafe-eval'` because
 * React's dev tooling needs it; the production policy in `vercel.json` omits it.
 */
function developmentCsp() {
  return `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.paystack.com https://applepay.cdn-apple.com https://pay.google.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://checkout.paystack.com;
    frame-src 'self' https://checkout.paystack.com https://standard.paystack.co;
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    manifest-src 'self';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['quail-conjoined-reverb.ngrok-free.dev'],
  async headers() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: developmentCsp() },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;

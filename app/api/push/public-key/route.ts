import { NextResponse } from 'next/server';

/**
 * Returns the VAPID public key so the browser can create a push subscription.
 * The private key never leaves the server. When push is not configured the
 * response is still 200 with `enabled: false` so the UI can explain itself.
 */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
  return NextResponse.json({
    enabled: Boolean(publicKey),
    publicKey,
  });
}

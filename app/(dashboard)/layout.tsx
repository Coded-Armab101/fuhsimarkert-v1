import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

/**
 * Server-side auth gate for every dashboard route.
 *
 * `proxy.ts` already redirects signed-out visitors, but proxy coverage can be
 * lost by a matcher edit and the Next docs treat it as an optimistic check only.
 * This layout is the backstop that runs during render, so no dashboard page can
 * be reached — or start fetching — without a verified session.
 *
 * Role checks are per-area (see `proxy.ts` and `seller/subscribe/page.tsx`), not
 * here, because `/buyer` is open to any signed-in user.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getUser() verifies the token with Supabase. getSession() would trust a
  // cookie, which is client-supplied.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <>{children}</>;
}

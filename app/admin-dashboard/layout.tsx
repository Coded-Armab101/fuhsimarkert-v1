/**
 * Admin area shell.
 *
 * Note this route sits outside the `(dashboard)` group, so it does NOT inherit
 * the auth gate in `app/(dashboard)/layout.tsx`. Access is currently denied by
 * the fail-closed role gate in `proxy.ts`. If this area is ever opened up, add a
 * real server-side admin check here — proxy alone is not sufficient.
 */
export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-black text-white">{children}</div>;
}

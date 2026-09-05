import Link from 'next/link';
import { Store } from 'lucide-react';

/**
 * Public marketplace landing — placeholder.
 *
 * Deliberately shows no products. `products` is readable only by authenticated
 * users under RLS, and the browse experience already exists at `/buyer`. If a
 * genuinely public catalogue is wanted later, expose a view with only safe
 * columns rather than opening the `products` table to `anon`.
 */
export default function MarketplacePage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-neutral-950 border border-neutral-800 rounded-3xl p-8 space-y-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-900/60 flex items-center justify-center mx-auto">
          <Store size={24} className="text-red-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold">FUHSI Market</h1>
          <p className="text-xs text-neutral-400 leading-relaxed">
            The campus marketplace for FUHSI students. Sign in to browse listings
            and pay safely through escrow.
          </p>
        </div>

        <div className="space-y-2.5">
          <Link
            href="/login"
            className="block w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3.5 rounded-2xl transition-all shadow-xl shadow-red-950/50"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="block w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-bold text-xs py-3.5 rounded-2xl transition-all"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

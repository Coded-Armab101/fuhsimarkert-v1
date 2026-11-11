import Link from 'next/link';
import { ArrowRight, ShieldCheck, Store } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

/**
 * Public marketplace landing.
 *
 * The live catalogue already appears on the public home page, where the
 * `products_select_public` policy allows anonymous reads of available items.
 * This route stays as a lightweight entry point into that catalogue and the
 * signed-in app.
 */
export default function MarketplacePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FAFAFA] px-4 py-10 font-sans text-[#2C2C2C]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 flex justify-center">
          <BrandLogo height={34} />
        </div>

        <div className="rounded-[1.75rem] border border-[#ECE5DE] bg-white p-7 text-center shadow-[0_14px_40px_rgba(44,44,44,0.06)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FDF0EA] text-[#DE6437]">
            <Store size={26} />
          </div>

          <h1 className="mt-4 text-xl font-black tracking-tight text-[#2C2C2C]">
            The FUHSI campus marketplace
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#81756D]">
            Browse student listings, pay safely through escrow, and collect your
            item on campus.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#DE6437] py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(222,100,55,0.25)] transition-colors hover:bg-[#C9511F]"
            >
              Browse the market
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              className="block w-full rounded-full border border-[#E7E0D8] bg-white py-3.5 text-sm font-bold text-[#2C2C2C] transition-colors hover:bg-[#FAFAFA]"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="block w-full rounded-full border border-transparent py-2.5 text-xs font-bold text-[#DE6437] transition-colors hover:underline"
            >
              Create an account
            </Link>
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 rounded-2xl bg-[#FDF0EA] p-3 text-[11px] font-bold text-[#C9511F]">
            <ShieldCheck size={16} />
            Every order is escrow protected
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#A79C92]">
          <Link href="/" className="hover:text-[#DE6437]">
            Home
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-[#DE6437]">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-[#DE6437]">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}

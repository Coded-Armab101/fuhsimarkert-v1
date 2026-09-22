'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';

const SWIPE_THRESHOLD = 70;
const MAX_INDEX = 3;

const productTiles = [
  { label: 'Gadgets', from: '#fe7743', to: '#ffad85' },
  { label: 'Books', from: '#ffd0b3', to: '#ffffff' },
  { label: 'Sneakers', from: '#ff9362', to: '#fe7743' },
  { label: 'Campus wear', from: '#ffffff', to: '#ffe3d1' },
];

function GlassChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-[10px] font-bold text-neutral-800 shadow-lg shadow-[#fe7743]/10 ring-1 ring-black/5 backdrop-blur-md">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function BrandGraphic() {
  return (
    <div className="relative h-80 w-full max-w-[300px]">
      {/* image-like gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[2.75rem]"
        style={{
          background:
            'radial-gradient(130% 95% at 12% 8%, rgba(254,119,67,0.38), rgba(255,255,255,0) 58%), radial-gradient(130% 95% at 92% 92%, rgba(254,119,67,0.28), rgba(255,255,255,0) 55%), linear-gradient(160deg, #fff7f2 0%, #ffe4d3 55%, #ffd0b3 100%)',
        }}
      />
      {/* glass phone mock */}
      <div className="absolute inset-x-5 top-10 bottom-10 flex flex-col rounded-[1.75rem] bg-white/70 p-4 shadow-2xl shadow-[#fe7743]/30 ring-1 ring-white/70 backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <span className="text-sm font-black tracking-tight text-neutral-900">
            FUHSI<span className="text-[#fe7743]">MARKET</span>
          </span>
          <span className="h-2 w-2 rounded-full bg-[#fe7743]" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {productTiles.map((tile) => (
            <div
              key={tile.label}
              className="flex h-14 items-end rounded-xl p-2 text-[9px] font-bold text-white/90"
              style={{ background: `linear-gradient(135deg, ${tile.from}, ${tile.to})` }}
            >
              {tile.label}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-full bg-[#fe7743] py-2 text-center text-[11px] font-bold text-white shadow-lg shadow-[#fe7743]/40">
          Browse campus deals
        </div>
      </div>
      {/* floating glass chips */}
      <div className="absolute left-0 top-3">
        <GlassChip icon={<ShieldCheck size={12} className="text-[#fe7743]" />} label="Escrow protected" />
      </div>
      <div className="absolute right-0 top-1">
        <GlassChip icon={<Truck size={12} className="text-[#fe7743]" />} label="Campus delivery" />
      </div>
    </div>
  );
}

function BuyerGraphic() {
  return (
    <div className="relative flex h-80 w-full max-w-[300px] items-center justify-center">
      <div aria-hidden className="absolute h-56 w-56 rounded-full bg-[#fe7743]/15 blur-2xl" />
      <div className="relative z-10 flex h-44 w-44 items-center justify-center rounded-[2rem] bg-white/60 shadow-2xl shadow-[#fe7743]/25 ring-1 ring-white/70 backdrop-blur-xl">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fe7743] text-white shadow-lg shadow-[#fe7743]/40">
          <ShoppingBag size={34} strokeWidth={2.2} />
        </div>
      </div>
      <div className="absolute left-0 top-16">
        <GlassChip icon={<ShieldCheck size={12} className="text-[#fe7743]" />} label="Escrow protected" />
      </div>
      <div className="absolute right-0 top-6">
        <GlassChip icon={<Search size={12} className="text-[#fe7743]" />} label="Verified listings" />
      </div>
      <div className="absolute bottom-6 left-4">
        <GlassChip icon={<MapPin size={12} className="text-[#fe7743]" />} label="Campus handover" />
      </div>
      <div className="absolute bottom-6 right-2">
        <GlassChip icon={<CheckCircle2 size={12} className="text-[#fe7743]" />} label="Pay on confirm" />
      </div>
    </div>
  );
}

function SellerGraphic() {
  return (
    <div className="relative flex h-80 w-full max-w-[300px] items-center justify-center">
      <div aria-hidden className="absolute h-56 w-56 rounded-full bg-[#fe7743]/15 blur-2xl" />
      <div className="relative z-10 flex h-44 w-44 items-center justify-center rounded-[2rem] bg-white/60 shadow-2xl shadow-[#fe7743]/25 ring-1 ring-white/70 backdrop-blur-xl">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#fe7743] text-white shadow-lg shadow-[#fe7743]/40">
          <Store size={34} strokeWidth={2.2} />
        </div>
      </div>
      <div className="absolute left-0 top-16">
        <GlassChip icon={<ShoppingBag size={12} className="text-[#fe7743]" />} label="List in minutes" />
      </div>
      <div className="absolute right-0 top-6">
        <GlassChip icon={<Wallet size={12} className="text-[#fe7743]" />} label="Wallet payouts" />
      </div>
      <div className="absolute bottom-6 left-2">
        <GlassChip icon={<ShieldCheck size={12} className="text-[#fe7743]" />} label="Verified buyers" />
      </div>
      <div className="absolute bottom-6 right-4">
        <GlassChip icon={<ArrowRight size={12} className="text-[#fe7743]" />} label="Sell to campus" />
      </div>
    </div>
  );
}

function BackCircle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Go back"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg shadow-black/5 ring-1 ring-black/10 transition-colors hover:bg-neutral-50 active:scale-95"
    >
      <ArrowLeft size={20} />
    </button>
  );
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-1 items-center justify-center gap-2 rounded-full bg-[#fe7743] py-4 text-sm font-bold text-white shadow-lg shadow-[#fe7743]/40 transition-transform active:scale-[0.98]"
    >
      {label} <ArrowRight size={18} />
    </button>
  );
}

function TermsNote() {
  return (
    <p className="mx-auto mt-5 max-w-xs text-center text-[11px] leading-relaxed text-neutral-500">
      By continuing you agree to our{' '}
      <Link href="/terms" className="font-semibold text-[#fe7743] underline underline-offset-2">
        Terms of Service
      </Link>{' '}
      and{' '}
      <Link href="/privacy" className="font-semibold text-[#fe7743] underline underline-offset-2">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

export default function OnboardingPage() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const startIndex = useRef(0);
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const goTo = (i: number) => setActive(Math.min(MAX_INDEX, Math.max(0, i)));

  // Arrow keys navigate the onboarding too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setActive((i) => Math.min(MAX_INDEX, i + 1));
      if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startIndex.current = active;
    setDragging(true);
    trackRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    let dx = e.clientX - startX.current;
    if ((startIndex.current === 0 && dx > 0) || (startIndex.current === MAX_INDEX && dx < 0)) dx *= 0.3;
    setDragX(dx);
  };

  const release = () => {
    if (!dragging) return;
    if (dragX <= -SWIPE_THRESHOLD) goTo(startIndex.current + 1);
    else if (dragX >= SWIPE_THRESHOLD) goTo(startIndex.current - 1);
    setDragX(0);
    setDragging(false);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-white font-sans text-neutral-900 select-none">
      {/* glassmorphism backdrop orbs */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#fe7743]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-28 top-1/3 h-72 w-72 rounded-full bg-[#ffc3a1]/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-4 h-64 w-64 rounded-full bg-[#fe7743]/20 blur-3xl" />

      <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col pt-6">
        {/* top bar */}
        <header className="px-7 pb-2">
          <span className="text-sm font-black tracking-tight text-neutral-900">
            FUHSI<span className="text-[#fe7743]">MARKET</span>
          </span>
        </header>

        {/* swipeable track */}
        <div
          ref={trackRef}
          className="flex-1 overflow-hidden touch-pan-y"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          aria-label="Fuhsi Market onboarding"
        >
          <div
            className="flex h-full"
            style={{
              transform: `translateX(calc(${active * -100}% + ${dragX}px))`,
              transition: dragging ? 'none' : 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* SLIDE 1 — brand */}
            <section className="flex h-full w-full shrink-0 flex-col px-7" aria-hidden={active !== 0}>
              <div className="flex flex-1 items-center justify-center pb-6">
                <BrandGraphic />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#fe7743]">Meet your market</p>
                <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight text-neutral-900">
                  Buy. Sell.{' '}
                  <span className="text-[#fe7743]">Stay safe.</span>
                </h2>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">
                  Fuhsi Market is the campus P2P hub — escrow-protected payments, verified students, and in-person
                  handovers.
                </p>
              </div>
              <div className="pt-2">
                <NextButton label="Continue" onClick={() => goTo(1)} />
                <TermsNote />
              </div>
            </section>

            {/* SLIDE 2 — buyer */}
            <section className="flex h-full w-full shrink-0 flex-col px-7" aria-hidden={active !== 1}>
              <div className="flex flex-1 items-center justify-center pb-6">
                <BuyerGraphic />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#fe7743]">For buyers</p>
                <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight text-neutral-900">
                  Shop campus.
                  <br />
                  Pay <span className="text-[#fe7743]">protected</span>.
                </h2>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">
                  Browse genuine listings from verified students, pay into escrow, and release funds only when you
                  confirm the handover.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <BackCircle onClick={() => goTo(0)} />
                <NextButton label="I want to buy" onClick={() => goTo(2)} />
              </div>
            </section>

            {/* SLIDE 3 — seller */}
            <section className="flex h-full w-full shrink-0 flex-col px-7" aria-hidden={active !== 2}>
              <div className="flex flex-1 items-center justify-center pb-6">
                <SellerGraphic />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#fe7743]">For sellers</p>
                <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight text-neutral-900">
                  Turn your things
                  <br />
                  into <span className="text-[#fe7743]">cash</span>.
                </h2>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">
                  List products in minutes, sell to thousands of verified campus buyers, and withdraw earnings straight
                  to your wallet.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <BackCircle onClick={() => goTo(1)} />
                <NextButton label="I want to sell" onClick={() => goTo(3)} />
              </div>
            </section>

            {/* SLIDE 4 — get started */}
            <section className="flex h-full w-full shrink-0 flex-col px-7" aria-hidden={active !== 3}>
              <div className="flex flex-1 items-center justify-center pb-6">
                <div className="relative flex h-80 w-full max-w-[300px] items-center justify-center">
                  <div aria-hidden className="absolute h-60 w-60 rounded-full bg-[#fe7743]/20 blur-3xl" />
                  <div className="relative z-10 flex h-48 w-48 flex-col items-center justify-center rounded-full bg-white/60 text-center shadow-2xl shadow-[#fe7743]/25 ring-1 ring-white/70 backdrop-blur-2xl">
                    <span className="text-xl font-black tracking-tight text-neutral-900">
                      FUHSI<span className="text-[#fe7743]">MARKET</span>
                    </span>
                    <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
                      Let&apos;s go
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#fe7743]">All set</p>
                <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight text-neutral-900">
                  Join the campus market.
                </h2>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">
                  One account to buy and sell. See you on campus.
                </p>
              </div>
              <div className="pt-2">
                <div className="flex items-center gap-3">
                  <BackCircle onClick={() => goTo(2)} />
                  <Link
                    href="/signup"
                    className="flex w-full flex-1 items-center justify-center gap-2 rounded-full bg-[#fe7743] py-4 text-sm font-bold text-white shadow-lg shadow-[#fe7743]/40 transition-transform active:scale-[0.98]"
                  >
                    Create free account <ArrowRight size={18} />
                  </Link>
                </div>
                <Link
                  href="/login"
                  className="mt-3 flex w-full items-center justify-center rounded-full bg-white py-4 text-sm font-bold text-neutral-900 ring-1 ring-black/10 transition-colors hover:bg-neutral-50"
                >
                  I already have an account
                </Link>
                <TermsNote />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
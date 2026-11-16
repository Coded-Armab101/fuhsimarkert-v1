'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, Sparkles, X } from 'lucide-react';

type Role = 'buyer' | 'seller';

type GuideStep = {
  title: string;
  body: string;
  tip?: string;
};

const GUIDES: Record<Role, { heading: string; intro: string; steps: GuideStep[] }> = {
  buyer: {
    heading: 'Welcome to FuhsiMarket',
    intro: 'A quick tour so your first campus order goes smoothly.',
    steps: [
      {
        title: 'Find what you need',
        body: 'Browse the feed or search for food, textbooks, gadgets and hostel essentials. Tap any item to see its details, seller and reviews.',
        tip: 'Use category chips to narrow the market down.',
      },
      {
        title: 'Choose options and save items',
        body: 'If a product has sizes or colours, pick one before adding it to your cart. Tap the heart to save an item for later.',
        tip: 'Buy Now checks out one item without clearing your saved cart.',
      },
      {
        title: 'Pay safely with escrow',
        body: 'Check out with card, transfer or your wallet. Your money is held by FuhsiMarket and is only released to the seller after you confirm you received the order.',
      },
      {
        title: 'Track your order',
        body: 'Open Orders to follow packing, pickup or delivery. When the item arrives, confirm receipt to release the seller’s money.',
        tip: 'Dispute an order from the Orders page if something is wrong.',
      },
    ],
  },
  seller: {
    heading: 'Start selling on FuhsiMarket',
    intro: 'Four steps from verification to your first payout.',
    steps: [
      {
        title: 'Complete your seller verification',
        body: 'Upload your student ID and verification video from your profile. An admin reviews it before your products go live.',
        tip: 'Use a clear photo and record a short video in good light.',
      },
      {
        title: 'List your first product',
        body: 'Add a clear title, price, stock and description. Upload one good photo and add sizes or colours only if the item really has them.',
        tip: 'Free-text options let a shirt use S/M/L and a phone use 128GB/256GB.',
      },
      {
        title: 'Prepare paid orders',
        body: 'When a buyer pays, the order appears in Sales. Start packing, then mark it ready for pickup or delivery.',
        tip: 'Combine items carefully — one order can contain several sellers.',
      },
      {
        title: 'Get paid after delivery',
        body: 'The buyer confirms receipt and escrow releases your earnings to your wallet. Request a withdrawal to your bank when you are ready.',
      },
    ],
  },
};

const STORAGE_PREFIX = 'fuhsi_onboarding_v1_';

function guideKey(role: Role) {
  return `${STORAGE_PREFIX}${role}`;
}

/**
 * First-run walkthrough for buyers and sellers. It shows once per browser for
 * each role; finishing, skipping or closing permanently completes it.
 */
export default function OnboardingGuide({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);

  const guide = useMemo(() => GUIDES[role], [role]);
  const isLast = step >= guide.steps.length - 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(guideKey(role)) !== 'done') setOpen(true);
      } catch {
        setOpen(true);
      }
      setReady(true);
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [role]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(guideKey(role), 'done');
    } catch {
      // Private mode can block storage; the guide simply shows again next time.
    }
    setOpen(false);
  }, [role]);

  if (!ready || !open) return null;

  const current = guide.steps[step];
  const progress = ((step + 1) / guide.steps.length) * 100;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="bg-gradient-to-br from-[#ff9a55] via-[#f47a3f] to-[#d9552f] px-5 pb-5 pt-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-white/80">
              <Sparkles size={14} />
              {role === 'seller' ? 'Seller guide' : 'Buyer guide'}
            </div>
            <button
              onClick={finish}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
              aria-label="Skip the guide"
            >
              <X size={16} />
            </button>
          </div>
          <h2 id="onboarding-title" className="mt-3 text-xl font-black leading-tight">
            {step === 0 ? guide.heading : current.title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-white/85">
            {step === 0 ? guide.intro : `Step ${step + 1} of ${guide.steps.length}`}
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#fff0e9] text-[#c9552e]">
              <Compass size={19} />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#251d18]">{current.title}</h3>
              <p className="mt-1 text-xs leading-6 text-[#5f5650]">{current.body}</p>
              {current.tip && (
                <p className="mt-2 rounded-xl bg-[#faf6f2] px-3 py-2 text-[11px] leading-5 text-[#7c4a38]">
                  {current.tip}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {guide.steps.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? 'w-5 bg-[#ef6b3b]' : 'w-1.5 bg-[#e8ded6]'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={finish}
              className="rounded-xl px-3 py-2.5 text-xs font-bold text-[#81756d] transition-colors hover:text-[#c9552e]"
            >
              Skip
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0}
                className="inline-flex items-center gap-1 rounded-xl border border-[#eadfd5] px-3 py-2.5 text-xs font-bold text-[#5f5650] transition-colors hover:border-[#ef6b3b] disabled:opacity-40"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={() => (isLast ? finish() : setStep((value) => value + 1))}
                className="inline-flex items-center gap-1 rounded-xl bg-[#ef6b3b] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#d8552e]"
              >
                {isLast ? (
                  <>
                    <Check size={14} /> Finish
                  </>
                ) : (
                  <>
                    Next <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

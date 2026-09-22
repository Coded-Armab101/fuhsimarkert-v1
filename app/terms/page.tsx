import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-[100dvh] bg-white font-sans text-neutral-900">
      <div className="mx-auto max-w-xl px-6 py-14">
        <Link href="/" className="text-sm font-black tracking-tight text-neutral-900">
          FUHSI<span className="text-[#fe7743]">MARKET</span>
        </Link>
        <h1 className="mt-8 text-3xl font-black tracking-tight text-neutral-900">Terms of Service</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-500">
          Your terms text goes here. This placeholder keeps the onboarding agreement links working until the full
          document is written.
        </p>
        <Link href="/" className="mt-8 inline-flex items-center gap-1 text-sm font-bold text-[#fe7743]">
          <span>&larr;</span> Back to home
        </Link>
      </div>
    </main>
  );
}
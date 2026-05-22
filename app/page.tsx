import Link from 'next/link';
import { ShoppingBag, ArrowRight, ShieldCheck, Users } from 'lucide-react';

export default function RootLandingPage() {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col justify-between">
      
      {/* BRAND HEADER BAR */}
      <header className="h-20 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-6 md:px-12">
        <div className="flex items-center space-x-2">
          <span className="text-xl font-black tracking-wider text-red-500">FUHSI<span className="text-white">MARKET</span></span>
        </div>
        
        <div className="flex items-center space-x-4">
          <Link href="/auth/login" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">
            Sign In
          </Link>
          <Link href="/auth/signup" className="bg-red-700 hover:bg-red-800 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-red-950/20">
            Join Platform
          </Link>
        </div>
      </header>

      {/* HERO HERO SECTION */}
      <main className="flex-1 max-w-4xl mx-auto flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="inline-flex items-center space-x-2 bg-neutral-950 border border-neutral-800 px-3 py-1.5 rounded-full text-xs text-neutral-400 mb-6 font-mono">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>The Official Campus P2P Escrow Hub</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight max-w-3xl">
          Buy, Sell, and Promote Safely Within Your <span className="text-red-500">Campus.</span>
        </h1>
        
        <p className="text-neutral-400 mt-6 max-w-xl text-sm md:text-base leading-relaxed">
          Fuhsi Market bridges the trust gap between student buyers, sellers, and affiliates with zero stress and absolute safety.
        </p>

        {/* PRIMARY GATEWAY BUTTONS */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
          <Link href="/auth/signup" className="w-full sm:w-auto bg-red-700 hover:bg-red-800 text-white font-bold px-8 py-4 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-xl shadow-red-950/30 group">
            <span>Get Started Immediately</span>
            <ArrowRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link href="/auth/login" className="w-full sm:w-auto bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-bold px-8 py-4 rounded-xl flex items-center justify-center transition-all">
            <span>Explore Dashboard</span>
          </Link>
        </div>

        {/* PILLARS MATRIX */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 border-t border-neutral-800/60 pt-12 text-left w-full">
          <div className="space-y-2">
            <div className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-900/40 flex items-center justify-center text-red-500">
              <ShieldCheck size={18} />
            </div>
            <h3 className="text-sm font-bold text-neutral-200">Escrow Secured</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">Funds remain perfectly protected until items are checked and received face-to-face.</p>
          </div>

          <div className="space-y-2">
            <div className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-900/40 flex items-center justify-center text-red-500">
              <ShoppingBag size={18} />
            </div>
            <h3 className="text-sm font-bold text-neutral-200">Verified Merchants</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">Every student seller passes portal registration checks before posting a single listing.</p>
          </div>

          <div className="space-y-2">
            <div className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-900/40 flex items-center justify-center text-red-500">
              <Users size={18} />
            </div>
            <h3 className="text-sm font-bold text-neutral-200">Affiliate Scaling</h3>
            <p className="text-xs text-neutral-500 leading-relaxed">Promote active peer marketplace links across group chats and earn clean percentage commissions.</p>
          </div>
        </div>
      </main>

      {/* MINIMAL FOOTER MARGIN */}
      <footer className="h-16 border-t border-neutral-800/40 flex items-center justify-center text-[11px] text-neutral-600 font-mono">
        &copy; {new Date().getFullYear()} Fuhsi Market. Built for student security.
      </footer>

    </div>
  );
}

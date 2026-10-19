// app/(dashboard)/seller/settings/page.tsx
"use client";

import Link from "next/link";
import { User, ShieldCheck, ArrowRight } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="seller-secondary max-w-2xl mx-auto space-y-5 py-2">
      <div className="bg-white border border-[#eee4dc] rounded-[1.75rem] p-6 shadow-sm">
        <h1 className="text-xl font-black text-[#251d18]">Seller Settings</h1>
        <p className="text-xs text-[#81756d] mt-1">
          Manage your account security and seller profile settings.
        </p>
      </div>

      <div className="bg-white border border-[#eee4dc] rounded-[1.75rem] p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-[#f0e9e2] pb-4">
          <div className="w-10 h-10 rounded-2xl bg-[#fff0e9] border border-[#ffe0cf] flex items-center justify-center text-[#ef6b3b]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#251d18]">Account Security & Password</h2>
            <p className="text-xs text-[#81756d]">
              Password changes and security settings are managed centrally in your Account Profile.
            </p>
          </div>
        </div>

        <Link
          href="/buyer/profile#security-details"
          className="inline-flex items-center justify-center gap-2 bg-[#2e2520] hover:bg-black text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all cursor-pointer shadow-sm"
        >
          <User size={15} />
          <span>Go to Account Security</span>
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

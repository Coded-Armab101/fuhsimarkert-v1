'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, Wallet, Landmark, Save, RefreshCw, PlusCircle, Cake, Store, TrendingUp, X, CheckCircle, ArrowRight, Zap, Sparkles } from 'lucide-react';
import { createClient } from '@/utils/supabase';

// Comprehensive list of Nigerian Banks for Paystack settlement routing
const NIGERIAN_BANKS = [
  "Access Bank", "Access Bank (Diamond)", "ALAT by WEMA", "Amju Unique MFB", "Baines Credit MFB",
  "Carbon", "Cuda MFB", "Dot MFB", "Ecobank Nigeria", "Eyowo", "Fidelity Bank", "First Bank of Nigeria",
  "First City Monument Bank (FCMB)", "Globus Bank", "Guaranty Trust Bank (GTB)", "Hasal MFB",
  "Heritage Bank", "Jaiz Bank", "Keystone Bank", "Kuda Bank", "Moniepoint MFB", "OPay Digital Services",
  "Palmpay", "Parallex Bank", "PremiumTrust Bank", "Providus Bank", "Rubies MFB", "Safe Haven MFB",
  "Sparkle Bank", "Stanbic IBTC Bank", "Standard Chartered Bank", "Sterling Bank", "Suntrust Bank",
  "TAJ Bank", "Titan Trust Bank", "Union Bank of Nigeria", "United Bank for Africa (UBA)", "Unity Bank",
  "VFD Microfinance Bank", "Wema Bank", "Zenith Bank"
].sort();

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [userAuth, setUserAuth] = useState<any>(null);
  
  // State for Role Selection Modal
  const [showRoleModal, setShowRoleModal] = useState(false);

  // Unified Form & Profile State
  const [profileData, setProfileData] = useState({
    fullName: '',
    matricNo: '',
    hostel: '',
    dob: '', 
    bankName: '',
    accountNumber: '',
    walletBalance: 0
  });

  useEffect(() => {
    const streamProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      
      setUserAuth(user);

      // 1. Get or Create Wallet Row
      let { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user.id).single();
      if (!wallet) {
        const { data: newW } = await supabase.from('wallets').insert([{ user_id: user.id, balance: 0 }]).select('balance').single();
        wallet = newW;
      }

      // 2. Get Profile Rows
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

      setProfileData({
        fullName: profile?.full_name || '',
        matricNo: profile?.matric_no || '',
        hostel: profile?.hostel || '',
        dob: profile?.dob || '', 
        bankName: profile?.bank_name || '',
        accountNumber: profile?.account_number || '',
        walletBalance: wallet?.balance || 0
      });

      setLoading(false);
    };

    streamProfileData();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;
    setUpdating(true);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userAuth.id,
        full_name: profileData.fullName,
        matric_no: profileData.matricNo,
        hostel: profileData.hostel,
        dob: profileData.dob, 
        bank_name: profileData.bankName,
        account_number: profileData.accountNumber,
        updated_at: new Date().toISOString()
      });

    setUpdating(false);
    if (!error) {
      alert('🔒 Profile data and secure bank pathways bound successfully!');
    } else {
      alert('Error updating configuration parameters.');
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-500 gap-2">
        <RefreshCw className="animate-spin text-red-500" size={20} />
        <span>Synchronizing decentralized identity records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      
      {/* HEADER MATRIX */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
            <User className="text-red-500" size={24} />
            {profileData.fullName || 'New Campus User'}
          </h1>
          <p className="text-xs text-neutral-400 font-mono text-[11px] max-w-sm truncate">
            UID Link: {userAuth?.email}
          </p>
        </div>

        {/* ROLE SELECTION BUTTON */}
        <button 
          onClick={() => setShowRoleModal(true)}
          className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-amber-950/30 active:scale-95 cursor-pointer"
        >
          <PlusCircle size={16} />
          <span>Choose a Role to Become</span>
        </button>
      </div>

      <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* ESCROW WALLET GRAPH */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-neutral-400">ESCROW LEDGER</span>
            <Wallet size={16} className="text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Guarantee Account Balance</p>
            <h2 className="text-3xl font-black font-mono text-emerald-400">
              ₦{(profileData.walletBalance / 100).toLocaleString()}
            </h2>
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            If an escrow transaction collapses or gets rejected, funds cascade instantly right here for secure extraction.
          </p>
        </div>

        {/* CORE DETAILS MATRIX */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* STUDENT CAMPUS METADATA */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold border-b border-neutral-900 pb-3 uppercase tracking-wider font-mono text-xs text-neutral-400">
              Personal Identity Parameters
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-400">Full Legal Name (Matches Bank Account)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Chinedu Okafor"
                  value={profileData.fullName}
                  onChange={(e) => setProfileData({...profileData, fullName: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-400">Matriculation Number</label>
                <input 
                  type="text"
                  required
                  placeholder="FUHSI/2024/*** "
                  value={profileData.matricNo}
                  onChange={(e) => setProfileData({...profileData, matricNo: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 font-mono uppercase"
                />
              </div>

              {/* DATE OF BIRTH FIELD */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-neutral-400 flex items-center gap-1">
                  <Cake size={13} className="text-amber-500" /> Date of Birth (Birthday Campaign Rewards)
                </label>
                <input 
                  type="date"
                  required
                  value={profileData.dob}
                  onChange={(e) => setProfileData({...profileData, dob: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-neutral-400">Current Campus Hostel / Location Residence</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Hostel B, Block C, Room 12"
                  value={profileData.hostel}
                  onChange={(e) => setProfileData({...profileData, hostel: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
          </div>

          {/* EXTENDED BANK SYSTEM SELECTION */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold border-b border-neutral-900 pb-3 flex items-center gap-2 uppercase tracking-wider font-mono text-xs text-neutral-400">
              <Landmark size={15} className="text-amber-500" /> Paystack Routing System Destination
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="text-neutral-400">Select Bank Partner</label>
                <select
                  required
                  value={profileData.bankName}
                  onChange={(e) => setProfileData({...profileData, bankName: e.target.value})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 appearance-none"
                >
                  <option value="">-- Choose Account Bank --</option>
                  {NIGERIAN_BANKS.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-neutral-400">10-Digit Account Number</label>
                <input 
                  type="text"
                  maxLength={10}
                  required
                  placeholder="0123456789"
                  value={profileData.accountNumber}
                  onChange={(e) => setProfileData({...profileData, accountNumber: e.target.value.replace(/\D/g, '')})}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 font-mono tracking-widest"
                />
              </div>
            </div>
          </div>

          {/* SUBMIT TRIGGER */}
          <button
            type="submit"
            disabled={updating}
            className="w-full sm:w-auto bg-red-700 hover:bg-red-600 disabled:bg-neutral-800 text-white font-bold text-xs px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg"
          >
            <Save size={14} />
            <span>{updating ? 'Encrypting Connection Logs...' : 'Commit Profile Matrix'}</span>
          </button>

        </div>

      </form>

      {/* 🚀 ROLE SELECTION MODAL */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in fade-in zoom-in duration-150">
            
            {/* CLOSE BUTTON */}
            <button 
              onClick={() => setShowRoleModal(false)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg bg-neutral-900 border border-neutral-800 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* MODAL HEADER */}
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-500 bg-amber-950/50 px-2.5 py-0.5 rounded border border-amber-800/60">
                FUHSI Role Activation
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">Choose a Role to Become</h2>
              <p className="text-xs text-neutral-400">Select how you want to expand your profile capabilities on FUHSI Market.</p>
            </div>

            {/* OPTIONS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* CARD 1: SELLER */}
              <div className="bg-neutral-900/80 border border-neutral-800 hover:border-red-500/50 rounded-2xl p-5 space-y-4 flex flex-col justify-between transition-all">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-900/50 text-red-500">
                      <Store size={22} />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/40 px-2.5 py-1 rounded border border-red-800/60">
                      ₦1,500 / mo
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">Become a Seller</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      List and sell your goods, electronics, books, or hostel services directly to students.
                    </p>
                  </div>

                  <ul className="space-y-1.5 text-[11px] text-neutral-300 font-mono">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-emerald-500 shrink-0" /> Unlimited product listings
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-emerald-500 shrink-0" /> Seller Studio & Order Management
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-emerald-500 shrink-0" /> Escrow payment protection
                    </li>
                  </ul>
                </div>

                <Link href="/seller/subscribe" className="block pt-2">
                  <button className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                    Become Seller (₦1.5k/mo) <ArrowRight size={14} />
                  </button>
                </Link>
              </div>

              {/* CARD 2: AFFILIATE (ALL-IN-ONE) */}
              <div className="bg-neutral-900/80 border border-amber-500/40 hover:border-amber-500 rounded-2xl p-5 space-y-4 flex flex-col justify-between transition-all relative overflow-hidden">
                <div className="absolute -top-3 -right-3 bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-bl-lg flex items-center gap-1">
                  <Sparkles size={10} /> All-In-One
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-900/50 text-amber-500">
                      <TrendingUp size={22} />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/60">
                      ₦2,000 / mo
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">Become an Affiliate</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Get <strong>ALL Seller features</strong> PLUS referral commissions when you bring vendors to FUHSI Market.
                    </p>
                  </div>

                  <ul className="space-y-1.5 text-[11px] text-neutral-300 font-mono">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-amber-500 shrink-0" /> Includes <strong>ALL Seller Features</strong>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-amber-500 shrink-0" /> Full Affiliate Hub & Link Generator
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-amber-500 shrink-0" /> Earn commissions on recruited sellers
                    </li>
                  </ul>
                </div>

                <Link href="/affiliate/subscribe" className="block pt-2">
                  <button className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                    Become Affiliate (₦2k/mo) <Zap size={14} />
                  </button>
                </Link>
              </div>

            </div>

            {/* MODAL FOOTER */}
            <div className="text-center text-[11px] text-neutral-500 border-t border-neutral-900 pt-3">
              💡 <strong>Pro Tip:</strong> Becoming an Affiliate (₦2,000/mo) includes full seller privileges so you don't need to pay for a Seller sub separately!
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
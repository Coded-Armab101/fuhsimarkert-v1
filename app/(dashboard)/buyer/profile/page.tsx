'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Wallet, Landmark, Save, PlusCircle, Cake, Store, X, CheckCircle, Zap, LayoutDashboard, Loader2, LogOut, IdCard, UploadCloud, ShieldCheck } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import { useCart } from '@/context/CartContext';
import { ROLE_PLANS, type RolePlan } from '@/utils/plans';
import { activeRole } from '@/utils/roles';
import { formatNaira } from '@/utils/money';
import { uploadStudentId, uploadVerificationVideo } from '@/utils/verify';
import VerificationRecorder from '../VerificationRecorder';

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

/** Kobo (the unit stored server side and sent to Paystack) → display naira. */
function naira(kobo: number): string {
  return `₦${formatNaira(kobo)}`;
}

export default function ProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const { clearCart } = useCart();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [userAuth, setUserAuth] = useState<{ id: string; email?: string | null } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [avatar, setAvatar] = useState('🦊');

  // Seller identity verification (after paying for a seller role).
  const [verification, setVerification] = useState<{
    isApproved: boolean;
    status: string | null;
    rejectReason: string | null;
    submittedAt: string | null;
  }>({ isApproved: false, status: null, rejectReason: null, submittedAt: null });
  const [idFile, setIdFile] = useState<File | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [submittingVerification, setSubmittingVerification] = useState(false);

  // Track if user has an active seller subscription
  const [isSeller, setIsSeller] = useState(false);

  // State for Role Selection Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycType, setKycType] = useState<'student_id' | 'nin'>('student_id');
  const [kycFile, setKycFile] = useState<File | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycReady, setKycReady] = useState(false);
  const [kycTypeSaved, setKycTypeSaved] = useState<'student_id' | 'nin' | null>(null);

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
  let isMounted = true;

  const streamProfileData = async () => {
    try {
      const savedAvatar = window.localStorage.getItem('fuhsi-avatar');
      // 1. Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        console.warn('No active user found or auth error:', authError);
        return;
      }

      if (isMounted) setUserAuth(user);

      // 2. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
      }

      // 3. Fetch escrow wallet balance (kobo)
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (isMounted) {
        if (savedAvatar) setAvatar(savedAvatar);
        setIsSeller(activeRole(profile) !== null);
        setVerification({
          isApproved: profile?.is_approved_seller === true,
          status: profile?.verification_status || null,
          rejectReason: profile?.verification_reject_reason || null,
          submittedAt: profile?.verification_submitted_at || null,
        });
        setKycReady(Boolean(profile?.student_id_url));
        setKycTypeSaved(profile?.verification_id_type === 'nin' ? 'nin' : profile?.student_id_url ? 'student_id' : null);

        setProfileData({
          fullName: profile?.full_name || '',
          matricNo: profile?.matric_no || '',
          hostel: profile?.hostel || '',
          dob: profile?.dob || '',
          bankName: profile?.bank_name || '',
          accountNumber: profile?.account_number || '',
          walletBalance: Number(wallet?.balance) || 0,
        });
      }
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
    } finally {
      // Guaranteed to unblock the UI regardless of success or failure
      if (isMounted) setLoading(false);
    }
  };

  streamProfileData();

  return () => {
    isMounted = false;
  };
}, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    if (profileData.accountNumber && !/^\d{10}$/.test(profileData.accountNumber)) {
      alert('Account number must be exactly 10 digits.');
      return;
    }

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
      alert('Your profile has been saved.');
    } else {
      console.error('Failed to update profile:', error);
      alert('Could not update your profile. Please try again.');
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      // The cart lives in localStorage under one key for every account, so a
      // second user signing in on the same device would inherit the previous
      // user's cart. Drop it on logout to keep each account's cart isolated.
      clearCart();
      localStorage.removeItem('fuhsi_cart');
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      setLoggingOut(false);
      setShowLogoutModal(false);
      alert('Could not sign you out. Please try again.');
    }
  };

  const handleWithdraw = async () => {
    const amount = Math.floor(Number(withdrawAmount) * 100); // naira → kobo
    if (!amount || amount <= 0) {
      alert('Enter a valid withdrawal amount.');
      return;
    }
    if (!profileData.bankName || !profileData.accountNumber) {
      alert('Add your bank and account number first.');
      return;
    }
    if (!userAuth?.id) {
      alert('User authentication details are missing. Please log in again.');
      return;
    }

    setWithdrawing(true);
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountKobo: amount,
          bankName: profileData.bankName,
          accountNumber: profileData.accountNumber,
          accountName: profileData.fullName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Could not process your withdrawal request.');
        setWithdrawing(false);
        return;
      }
      // Refresh the wallet balance shown on the ledger card.
      const walletRes = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userAuth.id)
        .maybeSingle();
      if (!walletRes.error) {
        const newBalance = Number(walletRes.data?.balance) || 0;
        setProfileData((prev) => ({ ...prev, walletBalance: newBalance }));
      }
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      alert('Withdrawal request submitted. An administrator will review and pay it out.');
    } catch (err) {
      console.error('Withdrawal error:', err);
      alert('Could not process your withdrawal request. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

    const handleVerificationSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userAuth?.id) return;

      if (!idFile && !kycReady) {
        alert('Please submit either your student ID or NIN document first.');
        return;
      }
      if (!recordingBlob) {
        alert('Please record the 3-second selfie video.');
        return;
      }

      setSubmittingVerification(true);
      try {
        // 1. Upload the ID image to the private bucket (owner-scoped).
        let idPath = '';
        if (idFile) {
          const idRes = await uploadStudentId(supabase, userAuth.id, idFile);
          if (!idRes.ok) throw new Error(idRes.error);
          idPath = idRes.path;
        }

        // 2. Turn the in-app recording into a file and upload it.
        const videoFile = new File([recordingBlob], `verification_${Date.now()}.webm`, {
          type: recordingBlob.type || 'video/webm',
        });
        const videoRes = await uploadVerificationVideo(supabase, userAuth.id, videoFile);
        if (!videoRes.ok) throw new Error(videoRes.error);

        // 3. Save the object paths and flip status to pending for admin review.
        const { error } = await supabase
          .from('profiles')
          .update({
            ...(idPath ? { student_id_url: idPath } : {}),
            verification_id_type: kycTypeSaved || 'student_id',
            verification_video_url: videoRes.path,
            verification_status: 'pending',
            verification_submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userAuth.id);
        if (error) throw error;

        setVerification({
          isApproved: false,
          status: 'pending',
          rejectReason: null,
          submittedAt: new Date().toISOString(),
        });
        setIdFile(null);
        setRecordingBlob(null);
        alert('Verification submitted. An administrator will review your ID and video.');
      } catch (err: unknown) {
        console.error('Verification submit error:', err);
        alert(err instanceof Error ? err.message : 'Could not submit your verification. Please try again.');
      } finally {
        setSubmittingVerification(false);
      }
    };

  const beginSellerOnboarding = () => {
    setShowRoleModal(false);
    if (kycReady) {
      void handleRolePayment('seller');
    } else {
      setShowKycModal(true);
    }
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth?.id || !kycFile) return;
    setKycSubmitting(true);
    try {
      const result = await uploadStudentId(supabase, userAuth.id, kycFile);
      if (!result.ok) throw new Error(result.error);
      const { error } = await supabase.from('profiles').update({
        student_id_url: result.path,
        verification_id_type: kycType,
        updated_at: new Date().toISOString(),
      }).eq('id', userAuth.id);
      if (error) throw error;
      setKycReady(true);
      setKycTypeSaved(kycType);
      setKycFile(null);
      setShowKycModal(false);
      void handleRolePayment('seller');
    } catch (err: unknown) {
      console.error('KYC submission failed:', err);
      alert(err instanceof Error ? err.message : 'Could not submit your KYC document.');
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleRolePayment = async (planType: RolePlan) => {

    setPaymentLoading(planType);

  try {
    // 1. Ask our server to open the transaction. The price lives on the server
    //    (utils/plans.ts) so it cannot be tampered with from the browser.
    const initRes = await fetch('/api/subscription/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType }),
    });

    const initData = await initRes.json();

    if (!initRes.ok || !initData.accessCode) {
      throw new Error(initData?.error || 'Could not start the payment session.');
    }

    // 2. Load the checkout popup. Imported lazily because the SDK touches
    //    `window` and this component is also rendered on the server.
    const { default: PaystackPop } = await import('@paystack/inline-js');
    const popup = new PaystackPop();

    popup.resumeTransaction(initData.accessCode, {
      // Fires once the customer has paid.
      onSuccess: async (transaction) => {
        try {
          const verifyRes = await fetch('/api/subscription/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: transaction.reference }),
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok || !verifyData.success) {
            throw new Error(verifyData?.error || 'Payment could not be confirmed.');
          }

          setIsSeller(true);
          setShowRoleModal(false);
          // Head to the seller area: the seller layout shows the verification
          // onboarding there, which blocks the tools until an admin approves.
          window.location.href = '/seller/verification';
        } catch (verifyErr: unknown) {
          console.error('Subscription verification failed:', verifyErr);
          alert(
            `Your payment went through (ref: ${transaction.reference}) but we could not activate the role automatically. ` +
              'Please keep this reference and contact support.'
          );
        } finally {
          setPaymentLoading(null);
        }
      },
      // Customer closed the popup.
      onCancel: () => {
        setPaymentLoading(null);
      },
      // Paystack could not load the checkout form.
      onError: (error) => {
        console.error('Paystack checkout error:', error);
        alert(error?.message || 'The payment window failed to load. Please try again.');
        setPaymentLoading(null);
      },
    });
  } catch (err: unknown) {
    console.error('Paystack initialization error:', err);
    alert(
      err instanceof Error
        ? err.message
        : 'Payment initialization failed. Check your browser console.'
    );
    setPaymentLoading(null);
  }
};

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse pt-3">
        <div className="mx-auto h-20 w-20 rounded-full bg-[#eee4dc]" />
        <div className="mx-auto h-4 w-36 rounded bg-[#eee4dc]" />
        <div className="rounded-[2rem] bg-white p-5"><div className="h-14 rounded-2xl bg-[#f4eee9]" /><div className="mt-2 h-14 rounded-2xl bg-[#faf6f2]" /><div className="mt-2 h-14 rounded-2xl bg-[#faf6f2]" /></div>
      </div>
    );
  }

  return (
    <div className="buyer-secondary space-y-5 relative py-2">
      <Link href="/buyer" className="inline-flex items-center gap-2 text-xs font-bold text-[#81756d] hover:text-[#d8552e]">← Back to home</Link>
      {/* HEADER MATRIX */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-[2rem] p-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xl text-center sm:text-left">
        <div className="space-y-1 flex flex-col items-center sm:items-start">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#c5a4ff] to-[#8c6ae8] text-3xl">
            {avatar}
          </div>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#8f8279]">Settings</p>
          <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
            <User className="text-red-500" size={24} />
            {profileData.fullName || 'Your account'}
          </h1>
          <p className="text-xs text-neutral-400 font-mono text-[11px] max-w-sm truncate">
            {userAuth?.email}
          </p>
        </div>

        {/* CONDITIONALLY RENDERED BUTTON */}
        {isSeller && verification.isApproved ? (
          <Link href="/seller">
            <button className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-red-950/40 active:scale-95 cursor-pointer">
              <LayoutDashboard size={16} />
              <span>Switch to Seller Studio</span>
            </button>
          </Link>
        ) : isSeller ? (
          <button
            onClick={() => router.push('/seller')}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-amber-950/30 active:scale-95 cursor-pointer"
          >
            <ShieldCheck size={16} />
            <span>Complete Verification to Sell</span>
          </button>
        ) : (
          <button 
            onClick={() => setShowRoleModal(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-amber-950/30 active:scale-95 cursor-pointer"
          >
            <PlusCircle size={16} />
            <span>Choose a Role to Become</span>
          </button>
        )}

        <button
          onClick={() => setShowLogoutModal(true)}
          className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all border border-neutral-800 hover:border-red-700 active:scale-95 cursor-pointer"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>

      <section className="rounded-[1.75rem] bg-white p-4 shadow-sm">
        <p className="text-xs font-bold text-[#251d18]">Choose your profile icon</p>
        <p className="mt-1 text-[11px] text-[#81756d]">Saved only on this device. It does not use database space.</p>
        <div className="mt-3 flex flex-wrap gap-2">{['🦊','🐼','🐸','🐯','🐙','🦋','⚽','🎧','📚','🚀','🌻','🍕'].map(icon => <button key={icon} onClick={() => { setAvatar(icon); window.localStorage.setItem('fuhsi-avatar', icon); }} className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${avatar === icon ? 'bg-[#fff0e9] ring-2 ring-[#ef6b3b]' : 'bg-[#faf6f2]'}`} aria-label={`Use ${icon} as your profile icon`}>{icon}</button>)}</div>
      </section>

      <section className="grid gap-2 rounded-[1.75rem] bg-white p-3 shadow-sm">
        <button onClick={() => document.getElementById('profile-details')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center justify-between rounded-2xl bg-[#faf6f2] px-4 py-4 text-left text-sm font-semibold text-[#251d18]"><span className="flex items-center gap-3"><User size={17} className="text-[#d8552e]" />Manage profile</span><span className="grid h-7 w-7 place-items-center rounded-full bg-white">→</span></button>
        <button onClick={() => document.getElementById('wallet-details')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center justify-between rounded-2xl bg-[#faf6f2] px-4 py-4 text-left text-sm font-semibold text-[#251d18]"><span className="flex items-center gap-3"><Wallet size={17} className="text-[#d8552e]" />Wallet and bank</span><span className="grid h-7 w-7 place-items-center rounded-full bg-white">→</span></button>
        <button onClick={() => isSeller ? document.getElementById('seller-details')?.scrollIntoView({ behavior: 'smooth' }) : setShowRoleModal(true)} className="flex items-center justify-between rounded-2xl bg-[#faf6f2] px-4 py-4 text-left text-sm font-semibold text-[#251d18]"><span className="flex items-center gap-3"><Store size={17} className="text-[#d8552e]" />Selling on FuhsiMarket</span><span className="grid h-7 w-7 place-items-center rounded-full bg-white">→</span></button>
      </section>

      {/* SELLER VERIFICATION ONBOARDING */}
      {isSeller && !verification.isApproved && (
        <div id="seller-details" className="bg-neutral-950 border border-amber-800/50 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-800/50 text-amber-500">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Seller Identity Verification</h3>
                <p className="text-[11px] text-neutral-400">
                  Record a ~3-second selfie video in the app and snap your student ID. Keep files under the size limits shown.
                </p>
              </div>
            </div>

            {verification.status === 'pending' && (
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/60">
                ⏳ Pending Admin Review
              </span>
            )}
            {verification.status === 'rejected' && (
              <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/40 px-2.5 py-1 rounded border border-red-800/60">
                ✕ Rejected
              </span>
            )}
          </div>

          {verification.status === 'pending' && (
            <p className="text-[11px] text-neutral-400 border-l-2 border-amber-700 pl-3">
              Your documents are being reviewed. You will be able to sell as soon as an administrator approves you.
            </p>
          )}

          {verification.status === 'rejected' && (
            <div className="text-[11px] text-neutral-300 border-l-2 border-red-700 pl-3 space-y-1">
              <p className="font-bold text-red-400">Your application was rejected:</p>
              {verification.rejectReason && <p>“{verification.rejectReason}”</p>}
              <p className="text-neutral-400">
                Your subscription stays active. Re-record your 3-second video and re-take your ID below, then resubmit and we will review again.
              </p>
            </div>
          )}

          {(verification.status === null || verification.status === 'rejected') && (
            <form onSubmit={handleVerificationSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* STUDENT ID */}
                <label className="block cursor-pointer bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-amber-500/50 transition-all">
                  <div className="flex items-center gap-2 text-neutral-300">
                    <IdCard size={16} className="text-amber-500" />
                    <span className="text-xs font-bold">Student ID Card (Photo)</span>
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1 mb-2">JPG / PNG / WEBP, up to 1MB</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <span className="text-[11px] text-neutral-400">
                    {idFile ? `✓ ${idFile.name}` : 'Tap to select your ID image'}
                  </span>
                </label>

                {/* VERIFICATION VIDEO — in-app 3s recording, auto-sent */}
                <VerificationRecorder
                  onRecorded={setRecordingBlob}
                  disabled={submittingVerification}
                />
              </div>

              <button
                type="submit"
                disabled={submittingVerification}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 text-white font-bold text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                {submittingVerification ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Uploading & Submitting...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} />
                    <span>{verification.status === 'rejected' ? 'Re-Submit Verification' : 'Submit for Verification'}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* ESCROW WALLET GRAPH */}
<div id="wallet-details" className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-white">ESCROW LEDGER</span>
            <Wallet size={16} className="text-emerald-400" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-white/80 uppercase font-bold tracking-wider">Wallet balance</p>
            <h2 className="text-3xl font-black font-mono text-white">
              ₦{(profileData.walletBalance / 100).toLocaleString()}
            </h2>
          </div>
          <p className="text-[11px] text-neutral-300 leading-relaxed">
            Refunds and money from completed sales are kept here. You can withdraw to your bank.
          </p>
          {profileData.walletBalance > 0 && (
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="w-full bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Wallet size={14} />
              <span>Withdraw to Bank</span>
            </button>
          )}
        </div>

        {/* CORE DETAILS MATRIX */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* STUDENT CAMPUS METADATA */}
          <div id="profile-details" className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-xl">
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
              <Landmark size={15} className="text-amber-500" /> Bank details
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
            <span>{updating ? 'Saving...' : 'Save changes'}</span>
          </button>

        </div>

      </form>

      {showKycModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleKycSubmit} className="bg-neutral-950 border border-neutral-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
            <button type="button" onClick={() => setShowKycModal(false)} disabled={kycSubmitting} className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg bg-neutral-900 border border-neutral-800"><X size={18}/></button>
            <div><div className="inline-flex items-center gap-2 rounded-full bg-amber-950/50 border border-amber-800/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400"><ShieldCheck size={13}/> Seller KYC</div><h2 className="mt-3 text-xl font-black text-white">Verify your identity first</h2><p className="mt-1 text-xs leading-5 text-neutral-400">Submit either your student ID or NIN document. The file stays in the private verification bucket.</p></div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setKycType('student_id')} className={`rounded-xl border px-3 py-3 text-xs font-bold ${kycType === 'student_id' ? 'border-red-500 bg-red-950/40 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-400'}`}>Student ID</button><button type="button" onClick={() => setKycType('nin')} className={`rounded-xl border px-3 py-3 text-xs font-bold ${kycType === 'nin' ? 'border-red-500 bg-red-950/40 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-400'}`}>NIN document</button></div>
            <label className="block cursor-pointer rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 p-5 text-center"><UploadCloud className="mx-auto text-amber-500" size={25}/><p className="mt-2 text-xs font-bold text-white">Upload {kycType === 'nin' ? 'NIN' : 'student ID'} document</p><p className="mt-1 text-[10px] text-neutral-500">JPG / PNG / WEBP · max 1MB</p><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => setKycFile(e.target.files?.[0] || null)}/><span className="mt-3 block text-[11px] text-neutral-400">{kycFile ? `✓ ${kycFile.name}` : 'Tap to choose a document'}</span></label>
            <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 p-3 text-[10px] leading-5 text-amber-200/80">Do not enter your NIN into a public profile field or send it through chat. Use this private upload only.</p>
            <button disabled={kycSubmitting || !kycFile} className="w-full rounded-xl bg-red-600 py-3 text-xs font-bold text-white disabled:opacity-50">{kycSubmitting ? 'Submitting KYC…' : 'Submit KYC and continue to payment'}</button>
          </form>
        </div>
      )}

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
            <div>
              
              {/* CARD 1: SELLER */}
              <div className="bg-neutral-900/80 border border-neutral-800 hover:border-red-500/50 rounded-2xl p-5 space-y-4 flex flex-col justify-between transition-all">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-900/50 text-red-500">
                      <Store size={22} />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/40 px-2.5 py-1 rounded border border-red-800/60">
                      {naira(ROLE_PLANS.seller.amount)} / mo
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

                <div className="pt-2">
                  <button
                    onClick={beginSellerOnboarding}
                    disabled={paymentLoading === 'seller'}
                    className="w-full bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 text-white font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {paymentLoading === 'seller' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Initializing...</span>
                      </>
                    ) : (
                      <>
                        <span>Become Seller ({naira(ROLE_PLANS.seller.amount)}/mo)</span>
                        <Zap size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>

            {/* MODAL FOOTER */}
            <div className="text-center text-[11px] text-neutral-500 border-t border-neutral-900 pt-3">
              💡 <strong>Pro Tip:</strong> Becoming a Seller unlocks your Studio, product listings and escrow payout access.
            </div>

          </div>
        </div>
      )}

    {/* 🚀 WITHDRAW CONFIRMATION MODAL */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 sm:p-8 space-y-5 shadow-2xl relative animate-in fade-in zoom-in duration-150 text-center">
            <button
              onClick={() => setShowWithdrawModal(false)}
              disabled={withdrawing}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg bg-neutral-900 border border-neutral-800 transition-all cursor-pointer disabled:opacity-50"
            >
              <X size={16} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-emerald-950/50 border border-emerald-900/50 flex items-center justify-center mx-auto">
              <Wallet size={24} className="text-emerald-500" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Withdraw to Bank</h2>
              <p className="text-xs text-neutral-400">
                Available: ₦{(profileData.walletBalance / 100).toLocaleString()} · Payout to{' '}
                <span className="text-emerald-400">{profileData.bankName || '— bank not set —'}</span>
              </p>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-neutral-400 text-xs">Amount (₦)</label>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowWithdrawModal(false)}
                disabled={withdrawing}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-bold py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {withdrawing ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
                <span>{withdrawing ? 'Processing...' : 'Withdraw'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    {/* 🚀 LOGOUT CONFIRMATION MODAL */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 sm:p-8 space-y-5 shadow-2xl relative animate-in fade-in zoom-in duration-150 text-center">
            <button
              onClick={() => setShowLogoutModal(false)}
              disabled={loggingOut}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg bg-neutral-900 border border-neutral-800 transition-all cursor-pointer disabled:opacity-50"
            >
              <X size={16} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-red-950/50 border border-red-900/50 flex items-center justify-center mx-auto">
              <LogOut size={24} className="text-red-500" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Are you sure you want to logout?</h2>
              <p className="text-xs text-neutral-400">
                You will need to sign in again to access your account.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                disabled={loggingOut}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-bold py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {loggingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                <span>{loggingOut ? 'Signing out...' : 'Yes, Logout'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

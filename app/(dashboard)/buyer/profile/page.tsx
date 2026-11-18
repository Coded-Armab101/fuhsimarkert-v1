'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Wallet, Landmark, Save, PlusCircle, Cake, Store, X, CheckCircle, Zap, LayoutDashboard, Loader2, LogOut, IdCard, UploadCloud, ShieldCheck, Lock, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import { useCart } from '@/context/CartContext';
import { ROLE_PLANS, type RolePlan } from '@/utils/plans';
import { activeRole, hasLapsedRole } from '@/utils/roles';
import { formatNaira } from '@/utils/money';
import { uploadStudentId, uploadVerificationVideo } from '@/utils/verify';
import VerificationRecorder from '../VerificationRecorder';
import ProfileInstallApp from '@/components/ProfileInstallApp';
import { useNotifications } from '@/components/NotificationProvider';
import { SELLER_VERIFICATION_CONSENT_VERSION } from '@/utils/legal';
import {
  grossUpPaystackLocalKobo,
  paystackTransferFeeKobo,
  WALLET_FUNDING_DAILY_MAX_KOBO,
  WALLET_FUNDING_MIN_KOBO,
  WALLET_WITHDRAWAL_DAILY_MAX_KOBO,
  WALLET_WITHDRAWAL_MIN_KOBO,
} from '@/utils/payment-fees';

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
  const { notify } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [userAuth, setUserAuth] = useState<{ id: string; email?: string | null } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [funding, setFunding] = useState(false);
  const [walletSummary, setWalletSummary] = useState({
    withdrawableKobo: 0,
    heldKobo: 0,
    nextReleaseAt: null as string | null,
  });
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
  const [verificationConsent, setVerificationConsent] = useState(false);
  const [submittingVerification, setSubmittingVerification] = useState(false);

  // Track if user has an active seller subscription
  const [isSeller, setIsSeller] = useState(false);
  // True when the user used to be a seller but the paid month has run out.
  // Those users need a renew CTA, not a "choose a role" pitch.
  const [sellerLapsed, setSellerLapsed] = useState(false);

  // State for Role Selection Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<'subscribe' | 'renew'>('subscribe');

  const openRoleModal = (mode: 'subscribe' | 'renew') => {
    setRoleModalMode(mode);
    setShowRoleModal(true);
  };

  // Password Change State
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const refreshWalletSummary = useCallback(async () => {
    const response = await fetch('/api/wallet/summary', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setProfileData((current) => ({ ...current, walletBalance: Number(data.total_kobo) || 0 }));
    setWalletSummary({
      withdrawableKobo: Number(data.withdrawable_kobo) || 0,
      heldKobo: Number(data.held_kobo) || 0,
      nextReleaseAt: typeof data.next_release_at === 'string' ? data.next_release_at : null,
    });
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: passwordForm.newPassword,
    });

    setPasswordLoading(false);

    if (error) {
      setPasswordMessage({ type: 'error', text: error.message });
    } else {
      setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    }
  };
    
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

      const walletResponse = await fetch('/api/wallet/summary', { cache: 'no-store' });
      const wallet = await walletResponse.json().catch(() => ({}));

      if (isMounted) {
        if (savedAvatar) setAvatar(savedAvatar);
        const paidSellerActive = activeRole(profile) !== null;
        const usedToSell = profile?.is_seller === true || profile?.seller_active === true;
        setIsSeller(paidSellerActive);
        setSellerLapsed(!paidSellerActive && usedToSell && hasLapsedRole(profile));
        setVerification({
          isApproved: profile?.is_approved_seller === true,
          status: profile?.verification_status || null,
          rejectReason: profile?.verification_reject_reason || null,
          submittedAt: profile?.verification_submitted_at || null,
        });

        setProfileData({
          fullName: profile?.full_name || '',
          matricNo: profile?.matric_no || '',
          hostel: profile?.hostel || '',
          dob: profile?.dob || '',
          bankName: profile?.bank_name || '',
          accountNumber: profile?.account_number || '',
           walletBalance: Number(wallet?.total_kobo) || 0,
         });
        setWalletSummary({
          withdrawableKobo: Number(wallet?.withdrawable_kobo) || 0,
          heldKobo: Number(wallet?.held_kobo) || 0,
          nextReleaseAt: typeof wallet?.next_release_at === 'string' ? wallet.next_release_at : null,
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
}, [supabase]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const reference = url.searchParams.get('reference') || url.searchParams.get('trxref');
    if (url.searchParams.get('funding') !== '1' || !reference) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/wallet/fund/verify?reference=${encodeURIComponent(reference)}`);
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || data.status !== 'success') {
          throw new Error(data?.error || 'Wallet funding was not completed.');
        }
        await refreshWalletSummary();
        notify(`₦${formatNaira(Number(data.credit_kobo) || 0)} was added to your wallet.`, { tone: 'success' });
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : 'Could not confirm wallet funding.', { tone: 'error' });
      } finally {
        url.searchParams.delete('reference');
        url.searchParams.delete('trxref');
        url.searchParams.delete('funding');
        window.history.replaceState(null, '', url.toString());
      }
    })();
    return () => { cancelled = true; };
  }, [notify, refreshWalletSummary]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    if (profileData.accountNumber && !/^\d{10}$/.test(profileData.accountNumber)) {
      notify('Account number must be exactly 10 digits.', { tone: 'warning' });
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: profileData.fullName,
          matricNo: profileData.matricNo,
          hostel: profileData.hostel,
          dob: profileData.dob || null,
          bankName: profileData.bankName,
          accountNumber: profileData.accountNumber,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || 'Could not update your profile.');
      }
      notify('Your profile has been saved.', { tone: 'success' });
    } catch (error) {
      console.error('Failed to update profile:', error);
      notify(error instanceof Error ? error.message : 'Could not update your profile. Please try again.', { tone: 'error' });
    } finally {
      setUpdating(false);
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
      notify('Could not sign you out. Please try again.', { tone: 'error' });
    }
  };

  const fundCreditKobo = Math.floor(Number(fundAmount) * 100) || 0;
  const fundQuote = grossUpPaystackLocalKobo(fundCreditKobo);
  const withdrawalBankKobo = Math.floor(Number(withdrawAmount) * 100) || 0;
  const withdrawalFeeKobo = paystackTransferFeeKobo(withdrawalBankKobo);
  const withdrawalWalletDebitKobo = withdrawalBankKobo + withdrawalFeeKobo;

  const handleFundWallet = async () => {
    if (
      fundCreditKobo < WALLET_FUNDING_MIN_KOBO ||
      fundCreditKobo > WALLET_FUNDING_DAILY_MAX_KOBO
    ) {
      notify('Fund between ₦500 and ₦100,000.', { tone: 'warning' });
      return;
    }
    setFunding(true);
    try {
      const response = await fetch('/api/wallet/fund/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditKobo: fundCreditKobo }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorization_url) {
        throw new Error(data?.error || 'Could not start wallet funding.');
      }
      window.location.href = data.authorization_url;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start wallet funding.', { tone: 'error' });
      setFunding(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = withdrawalBankKobo;
    if (amount < WALLET_WITHDRAWAL_MIN_KOBO || amount > WALLET_WITHDRAWAL_DAILY_MAX_KOBO) {
      notify('Withdraw between ₦1,000 and ₦100,000.', { tone: 'warning' });
      return;
    }
    if (withdrawalWalletDebitKobo > walletSummary.withdrawableKobo) {
      notify('Your withdrawable balance must cover both the bank amount and Paystack transfer fee.', { tone: 'warning' });
      return;
    }
    if (!profileData.bankName || !profileData.accountNumber) {
      notify('Add your bank and account number first.', { tone: 'warning' });
      return;
    }
    if (!userAuth?.id) {
      notify('User authentication details are missing. Please log in again.', { tone: 'error' });
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
        notify(data?.error || 'Could not process your withdrawal request.', { tone: 'error' });
        setWithdrawing(false);
        return;
      }
      await refreshWalletSummary();
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      notify(`Withdrawal requested. ₦${formatNaira(amount)} will reach the bank after admin approval; ₦${formatNaira(Number(data.transfer_fee_kobo) || withdrawalFeeKobo)} covers transfer charges.`, { tone: 'success' });
    } catch (err) {
      console.error('Withdrawal error:', err);
      notify('Could not process your withdrawal request. Please try again.', { tone: 'error' });
    } finally {
      setWithdrawing(false);
    }
  };

    const handleVerificationSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userAuth?.id) return;

      if (!idFile) {
        notify('Please take a photo of your student ID card.', { tone: 'warning' });
        return;
      }
      if (!recordingBlob) {
        notify('Please record the 3-second selfie video.', { tone: 'warning' });
        return;
      }
      if (!verificationConsent) {
        notify('Please agree to the verification use of your ID and video.', { tone: 'warning' });
        return;
      }

      setSubmittingVerification(true);
      try {
        // 1. Upload the ID image to the private bucket (owner-scoped).
        const idRes = await uploadStudentId(supabase, userAuth.id, idFile);
        if (!idRes.ok) throw new Error(idRes.error);

        // 2. Turn the in-app recording into a file and upload it.
        const videoFile = new File([recordingBlob], `verification_${Date.now()}.webm`, {
          type: recordingBlob.type || 'video/webm',
        });
        const videoRes = await uploadVerificationVideo(supabase, userAuth.id, videoFile);
        if (!videoRes.ok) throw new Error(videoRes.error);

        // 3. Record the private object paths together with explicit consent.
        const response = await fetch('/api/seller/verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIdPath: idRes.path,
            videoPath: videoRes.path,
            consent: verificationConsent,
            consentVersion: SELLER_VERIFICATION_CONSENT_VERSION,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || 'Could not submit your verification.');

        setVerification({
          isApproved: false,
          status: 'pending',
          rejectReason: null,
          submittedAt: result.submittedAt || new Date().toISOString(),
        });
        setIdFile(null);
        setRecordingBlob(null);
        setVerificationConsent(false);
        notify('Verification submitted. An administrator will review your ID and video.', { tone: 'success' });
      } catch (err: unknown) {
        console.error('Verification submit error:', err);
        notify(err instanceof Error ? err.message : 'Could not submit your verification. Please try again.', { tone: 'error' });
      } finally {
        setSubmittingVerification(false);
      }
    };

  const handleWalletRenew = async (planType: RolePlan) => {
    setPaymentLoading(`wallet-${planType}`);
    try {
      const response = await fetch('/api/subscription/renew-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Could not renew with your wallet balance.');
      }
      setIsSeller(true);
      setSellerLapsed(false);
      setShowRoleModal(false);
      await refreshWalletSummary();
      notify(
        data.alreadyRenewed
          ? 'Your seller plan is already active.'
          : `Seller plan renewed with your wallet. Active until ${new Date(data.expiresAt).toLocaleDateString('en-NG')}.`,
        { tone: 'success' },
      );
      window.location.href = data.redirectUrl || '/seller/verification';
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Could not renew with your wallet balance.', { tone: 'error' });
    } finally {
      setPaymentLoading(null);
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

          setIsSeller(true);
          setShowRoleModal(false);
          const target = verifyData?.redirectUrl || '/seller/verification';
          window.location.href = target;
        } catch (verifyErr: unknown) {
          console.error('Subscription verification non-fatal:', verifyErr);
          setIsSeller(true);
          setShowRoleModal(false);
          window.location.href = '/seller/verification';
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
        notify(error?.message || 'The payment window failed to load. Please try again.', { tone: 'error' });
        setPaymentLoading(null);
      },
    });
  } catch (err: unknown) {
    console.error('Paystack initialization error:', err);
    notify(
      err instanceof Error
        ? err.message
        : 'Payment initialization failed. Check your browser console.',
      { tone: 'error' },
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
    <div className="buyer-secondary relative mx-auto max-w-4xl space-y-5 py-2">
      <Link href="/buyer" className="inline-flex items-center gap-2 text-xs font-bold text-[#81756d] transition-colors hover:text-[#d8552e]">← Back to home</Link>

      <section className="overflow-hidden rounded-[2rem] border border-[#eee4dc] bg-gradient-to-br from-[#fff7f2] via-white to-[#faf6f2] shadow-[0_16px_45px_rgba(65,42,29,.08)]">
        <div className="flex items-center justify-between border-b border-[#f0e9e2] px-5 py-3">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#d8552e]">Your FuhsiMarket account</p>
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-[#81756d] transition-colors hover:bg-white hover:text-[#c2410c]"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[1.6rem] bg-gradient-to-br from-[#c5a4ff] to-[#8c6ae8] text-4xl shadow-sm">
              {avatar}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black tracking-tight text-[#251d18]">
                {profileData.fullName || 'Complete your profile'}
              </h1>
              <p className="mt-1 truncate text-[11px] font-mono text-[#81756d]">{userAuth?.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#eadfd6] bg-white px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#81756d]">Buyer</span>
                {isSeller ? (
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${verification.isApproved ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {verification.isApproved ? 'Verified seller' : 'Seller verification needed'}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0">
              {isSeller && verification.isApproved ? (
                <Link href="/seller" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] px-5 py-3.5 text-xs font-black text-white shadow-lg shadow-[#ef6b3b]/20 transition-colors hover:bg-[#d8552e] sm:w-auto">
                  <LayoutDashboard size={16} /> Switch to Seller Studio
                </Link>
              ) : isSeller ? (
                <button type="button" onClick={() => router.push('/seller')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-5 py-3.5 text-xs font-black text-white transition-colors hover:bg-amber-500 sm:w-auto">
                  <ShieldCheck size={16} /> Complete seller verification
                </button>
              ) : sellerLapsed ? (
                <button type="button" onClick={() => openRoleModal('renew')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] px-5 py-3.5 text-xs font-black text-white transition-colors hover:bg-[#d8552e] sm:w-auto">
                  <RefreshCw size={16} /> Renew seller access
                </button>
              ) : (
                <button type="button" onClick={() => openRoleModal('subscribe')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2e2520] px-5 py-3.5 text-xs font-black text-white transition-colors hover:bg-black sm:w-auto">
                  <PlusCircle size={16} /> Become a seller
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-[#f0e9e2] pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9d9188]">Profile icon · saved on this device</p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {['🦊','🐼','🐸','🐯','🐙','🦋','⚽','🎧','📚','🚀','🌻','🍕'].map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => { setAvatar(icon); window.localStorage.setItem('fuhsi-avatar', icon); }}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg transition-all ${avatar === icon ? 'bg-[#fff0e9] ring-2 ring-[#ef6b3b]' : 'bg-white ring-1 ring-[#eee4dc] hover:bg-[#faf6f2]'}`}
                  aria-label={`Use ${icon} as your profile icon`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ProfileInstallApp />

      <nav className="grid grid-cols-3 gap-2 rounded-[1.5rem] border border-[#eee4dc] bg-white p-2 shadow-sm" aria-label="Account sections">
        {[
          { id: 'profile-details', label: 'Profile', icon: User },
          { id: 'wallet-details', label: 'Wallet', icon: Wallet },
          { id: 'security-details', label: 'Security', icon: Lock },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-bold text-[#6f625a] transition-colors hover:bg-[#fff7f2] hover:text-[#d8552e]"
            >
              <Icon size={17} /> {item.label}
            </button>
          );
        })}
      </nav>

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
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-[11px] leading-relaxed text-neutral-300">
                <input
                  type="checkbox"
                  checked={verificationConsent}
                  onChange={(event) => setVerificationConsent(event.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
                />
                <span>
                  I agree that FuhsiMarket may use my student ID and short selfie video only to confirm that I am the FUHSI student represented by this account. The private files are not used for advertising or facial recognition and are deleted after review.{' '}
                  <Link href="/privacy" target="_blank" className="font-bold text-amber-400 underline">
                    Privacy details
                  </Link>
                </span>
              </label>
              {!verificationConsent ? (
                <p className="text-[10px] font-mono text-amber-400">Agree above to unlock the upload controls.</p>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* STUDENT ID */}
                <label className={`block bg-neutral-900 border border-neutral-800 rounded-xl p-4 transition-all ${verificationConsent ? 'cursor-pointer hover:border-amber-500/50' : 'cursor-not-allowed opacity-55'}`}>
                  <div className="flex items-center gap-2 text-neutral-300">
                    <IdCard size={16} className="text-amber-500" />
                    <span className="text-xs font-bold">Student ID Card (Photo)</span>
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1 mb-2">JPG / PNG / WEBP, up to 1MB</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    disabled={!verificationConsent || submittingVerification}
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
                  disabled={!verificationConsent || submittingVerification}
                />
              </div>

              <button
                type="submit"
                disabled={submittingVerification || !verificationConsent}
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

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        
        {/* ESCROW WALLET GRAPH */}
        <div id="wallet-details" className="profile-wallet scroll-mt-24 space-y-4 rounded-[1.75rem] bg-gradient-to-br from-[#2e2520] to-[#47372f] p-5 text-white shadow-xl lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[.16em] text-white/65">FuhsiMarket wallet</span>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><Wallet size={17} /></span>
          </div>
          <div className="space-y-1">
            <p className="wallet-muted text-[11px] text-white/70">Available balance</p>
            <h2 className="text-3xl font-black font-mono text-white sm:text-4xl">
              ₦{(profileData.walletBalance / 100).toLocaleString()}
            </h2>
          </div>
          <p className="wallet-muted text-[11px] leading-relaxed text-white/65">
            Funded money and refunds can be spent immediately. Those credits unlock for bank withdrawal after 14 days; seller earnings are withdrawable immediately.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/10 p-3 text-[10px]">
            <div>
              <p className="wallet-muted text-white/60">Withdrawable now</p>
              <p className="mt-1 font-mono text-sm font-black text-white">₦{formatNaira(walletSummary.withdrawableKobo)}</p>
            </div>
            <div>
              <p className="wallet-muted text-white/60">14-day hold</p>
              <p className="mt-1 font-mono text-sm font-black text-white">₦{formatNaira(walletSummary.heldKobo)}</p>
            </div>
          </div>
          {walletSummary.nextReleaseAt ? (
            <p className="wallet-muted text-[10px] text-white/60">
              Next held credit unlocks {new Date(walletSummary.nextReleaseAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowFundModal(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#ef6b3b] py-3 text-xs font-black text-white transition-colors hover:bg-[#d8552e]"
            >
              <PlusCircle size={14} /> Fund wallet
            </button>
            <button
              type="button"
              onClick={() => setShowWithdrawModal(true)}
              disabled={walletSummary.withdrawableKobo < WALLET_WITHDRAWAL_MIN_KOBO}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-xs font-black text-[#2e2520] transition-all hover:bg-[#fff0e9] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Landmark size={14} />
              <span>Withdraw</span>
            </button>
          </div>
        </div>

        {/* CORE DETAILS MATRIX */}
        <div className="space-y-5 lg:col-span-2">
          <form onSubmit={handleUpdateProfile} className="space-y-5">
          
          {/* STUDENT CAMPUS METADATA */}
          <section id="profile-details" className="scroll-mt-24 space-y-5 rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-[#f0e9e2] pb-4">
              <h2 className="text-sm font-black text-[#251d18]">Personal information</h2>
              <p className="mt-1 text-[11px] text-[#81756d]">Used for your account, campus orders and student verification.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#6f625a]">Full legal name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Chinedu Okafor"
                  value={profileData.fullName}
                  onChange={(e) => setProfileData({...profileData, fullName: e.target.value})}
                  className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 text-[#251d18] outline-none focus:border-[#ef6b3b]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#6f625a]">Matriculation number</label>
                <input 
                  type="text"
                  required
                  placeholder="FUHSI/2024/*** "
                  value={profileData.matricNo}
                  onChange={(e) => setProfileData({...profileData, matricNo: e.target.value})}
                  className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono uppercase text-[#251d18] outline-none focus:border-[#ef6b3b]"
                />
              </div>

              {/* DATE OF BIRTH FIELD */}
              <div className="space-y-1 sm:col-span-2">
                <label className="flex items-center gap-1 font-bold text-[#6f625a]">
                  <Cake size={13} className="text-[#ef6b3b]" /> Date of birth
                </label>
                <input 
                  type="date"
                  required
                  value={profileData.dob}
                  onChange={(e) => setProfileData({...profileData, dob: e.target.value})}
                  className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono text-[#251d18] outline-none focus:border-[#ef6b3b]"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-bold text-[#6f625a]">Campus hostel or current location</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Hostel B, Block C, Room 12"
                  value={profileData.hostel}
                  onChange={(e) => setProfileData({...profileData, hostel: e.target.value})}
                  className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 text-[#251d18] outline-none focus:border-[#ef6b3b]"
                />
              </div>
            </div>
          </section>

          {/* EXTENDED BANK SYSTEM SELECTION */}
          <section className="space-y-5 rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-[#f0e9e2] pb-4">
              <h2 className="flex items-center gap-2 text-sm font-black text-[#251d18]"><Landmark size={16} className="text-[#ef6b3b]" /> Bank & payouts</h2>
              <p className="mt-1 text-[11px] text-[#81756d]">Only required when you want money sent to a bank account.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#6f625a]">Bank</label>
                <select
                  value={profileData.bankName}
                  onChange={(e) => setProfileData({...profileData, bankName: e.target.value})}
                  className="w-full appearance-none rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 text-[#251d18] outline-none focus:border-[#ef6b3b]"
                >
                  <option value="">-- Choose Account Bank --</option>
                  {NIGERIAN_BANKS.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#6f625a]">10-digit account number</label>
                <input 
                  type="text"
                  maxLength={10}
                  placeholder="0123456789"
                  value={profileData.accountNumber}
                  onChange={(e) => setProfileData({...profileData, accountNumber: e.target.value.replace(/\D/g, '')})}
                  className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono tracking-widest text-[#251d18] outline-none focus:border-[#ef6b3b]"
                />
              </div>
            </div>
          </section>

          {/* SUBMIT TRIGGER */}
          <button
            type="submit"
            disabled={updating}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] px-6 py-3.5 text-xs font-black text-white shadow-lg shadow-[#ef6b3b]/20 transition-colors hover:bg-[#d8552e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <Save size={14} />
            <span>{updating ? 'Saving...' : 'Save changes'}</span>
          </button>
          </form>

          {/* SECURITY & PASSWORD CHANGE */}
          <section id="security-details" className="scroll-mt-24 space-y-5 rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-[#f0e9e2] pb-4">
              <h2 className="flex items-center gap-2 text-sm font-black text-[#251d18]"><Lock size={15} className="text-[#ef6b3b]" /> Password & security</h2>
              <p className="mt-1 text-[11px] text-[#81756d]">Use a unique password with at least six characters.</p>
            </div>

            {passwordMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-mono border ${
                  passwordMessage.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                    : 'bg-red-950/40 border-red-800/60 text-red-400'
                }`}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-[#6f625a]">New password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono text-[#251d18] outline-none focus:border-[#ef6b3b]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#6f625a]">Confirm new password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono text-[#251d18] outline-none focus:border-[#ef6b3b]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#2e2520] px-5 py-3 text-xs font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {passwordLoading && <Loader2 size={14} className="animate-spin" />}
                <span>{passwordLoading ? 'Updating...' : 'Update Password'}</span>
              </button>
            </form>
          </section>

        </div>

      </div>

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
                {roleModalMode === 'renew' ? 'FUHSI Seller Renewal' : 'FUHSI Role Activation'}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {roleModalMode === 'renew' ? 'Renew your seller plan' : 'Choose a Role to Become'}
              </h2>
              <p className="text-xs text-neutral-400">
                {roleModalMode === 'renew'
                  ? 'Your paid month has ended. Renew now to reopen your Seller Studio, keep your listings live and keep accepting orders.'
                  : 'Select how you want to expand your profile capabilities on FUHSI Market.'}
              </p>
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
                    <h3 className="text-base font-bold text-white">
                      {roleModalMode === 'renew' ? 'Renew Seller Plan' : 'Become a Seller'}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      {roleModalMode === 'renew'
                        ? 'Adds another 30 days to your seller access. Your products, orders and verification stay exactly as they are.'
                        : 'List and sell your goods, electronics, books, or hostel services directly to students.'}
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
                    onClick={() => handleRolePayment('seller')}
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
                        <span>
                          {roleModalMode === 'renew'
                            ? `Renew for next month (${naira(ROLE_PLANS.seller.amount)})`
                            : `Become Seller (${naira(ROLE_PLANS.seller.amount)}/mo)`}
                        </span>
                        {roleModalMode === 'renew' ? <RefreshCw size={14} /> : <Zap size={14} />}
                      </>
                    )}
                  </button>

                  {profileData.walletBalance >= ROLE_PLANS.seller.amount ? (
                    <button
                      type="button"
                      onClick={() => void handleWalletRenew('seller')}
                      disabled={paymentLoading === 'wallet-seller'}
                      className="mt-2 w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-neutral-800 text-white font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {paymentLoading === 'wallet-seller' ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Renewing from wallet...</span>
                        </>
                      ) : (
                        <>
                          <Wallet size={14} />
                          <span>
                            {roleModalMode === 'renew' ? 'Renew next month' : 'Subscribe'} with wallet ({naira(ROLE_PLANS.seller.amount)})
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <p className="mt-2 text-center text-[10px] font-mono text-neutral-500">
                      Wallet balance {naira(profileData.walletBalance)} · needs {naira(ROLE_PLANS.seller.amount)} to pay with wallet. Held top-ups can be spent here.
                    </p>
                  )}
                </div>
              </div>

            </div>

            {/* MODAL FOOTER */}
            <div className="text-center text-[11px] text-neutral-500 border-t border-neutral-900 pt-3">
              💡 <strong>Pro Tip:</strong>{' '}
              {roleModalMode === 'renew'
                ? 'Renewing keeps your existing listings and seller verification — nothing needs to be re-uploaded.'
                : 'Becoming a Seller unlocks your Studio, product listings and escrow payout access.'}
            </div>

          </div>
        </div>
      )}

      {showFundModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[#251d18]/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm space-y-5 rounded-[1.75rem] border border-[#eee4dc] bg-white p-6 text-[#251d18] shadow-2xl sm:p-7">
            <button
              type="button"
              onClick={() => setShowFundModal(false)}
              disabled={funding}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[#faf6f2] text-[#81756d] disabled:opacity-50"
              aria-label="Close wallet funding"
            >
              <X size={15} />
            </button>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0e9] text-[#d8552e]">
              <PlusCircle size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black">Fund your wallet</h2>
              <p className="mt-1 text-xs leading-5 text-[#81756d]">
                Wallet credit is available for purchases immediately. Any unspent funded amount unlocks for bank withdrawal after 14 days.
              </p>
            </div>
            <label className="block text-xs font-bold text-[#6f625a]">
              Amount to add (₦)
              <input
                type="number"
                inputMode="decimal"
                min={500}
                max={100000}
                value={fundAmount}
                onChange={(event) => setFundAmount(event.target.value)}
                placeholder="500"
                className="mt-2 w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono text-sm text-[#251d18] outline-none focus:border-[#ef6b3b]"
              />
            </label>
            <div className="space-y-2 rounded-2xl bg-[#faf6f2] p-4 text-[11px] text-[#6f625a]">
              <div className="flex justify-between"><span>Wallet credit</span><strong>₦{formatNaira(fundCreditKobo)}</strong></div>
              <div className="flex justify-between"><span>Paystack processing</span><strong>₦{formatNaira(fundQuote.processingFeeKobo)}</strong></div>
              <div className="flex justify-between border-t border-[#e9dfd7] pt-2 text-xs text-[#251d18]"><span>You pay</span><strong>₦{formatNaira(fundQuote.grossKobo)}</strong></div>
            </div>
            <p className="text-[10px] leading-4 text-[#9d9188]">
              The processing charge covers Paystack and is not wallet credit. Disable international payment methods in Paystack so this local-fee quote remains accurate.
            </p>
            <button
              type="button"
              onClick={handleFundWallet}
              disabled={funding}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] py-3.5 text-xs font-black text-white transition-colors hover:bg-[#d8552e] disabled:opacity-60"
            >
              {funding ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {funding ? 'Opening Paystack…' : `Continue · ₦${formatNaira(fundQuote.grossKobo)}`}
            </button>
          </div>
        </div>
      )}

    {/* 🚀 WITHDRAW CONFIRMATION MODAL */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-[#251d18]/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm space-y-5 rounded-[1.75rem] border border-[#eee4dc] bg-white p-6 text-[#251d18] shadow-2xl sm:p-7">
            <button
              type="button"
              onClick={() => setShowWithdrawModal(false)}
              disabled={withdrawing}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[#faf6f2] text-[#81756d] disabled:opacity-50"
              aria-label="Close withdrawal"
            >
              <X size={16} />
            </button>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Landmark size={22} />
            </div>

            <div>
              <h2 className="text-lg font-black">Withdraw to bank</h2>
              <p className="mt-1 text-xs leading-5 text-[#81756d]">
                Withdrawable now: <strong className="text-emerald-700">₦{formatNaira(walletSummary.withdrawableKobo)}</strong> · {profileData.bankName || 'bank not set'}
              </p>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-[#6f625a]">Amount the bank should receive (₦)</label>
              <input
                type="number"
                inputMode="decimal"
                min={1000}
                max={100000}
                placeholder="1,000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono text-[#251d18] outline-none focus:border-emerald-600"
              />
            </div>

            <div className="space-y-2 rounded-2xl bg-[#faf6f2] p-4 text-[11px] text-[#6f625a]">
              <div className="flex justify-between"><span>Bank receives</span><strong>₦{formatNaira(withdrawalBankKobo)}</strong></div>
              <div className="flex justify-between"><span>Transfer + stamp charge</span><strong>₦{formatNaira(withdrawalFeeKobo)}</strong></div>
              <div className="flex justify-between border-t border-[#e9dfd7] pt-2 text-xs text-[#251d18]"><span>Wallet debit</span><strong>₦{formatNaira(withdrawalWalletDebitKobo)}</strong></div>
            </div>

            {walletSummary.heldKobo > 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                ₦{formatNaira(walletSummary.heldKobo)} is still inside its 14-day cash-out hold but can already be spent in the marketplace.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                disabled={withdrawing}
                className="rounded-xl border border-[#e8ddd4] bg-white py-3 text-xs font-bold text-[#6f625a] transition-colors hover:bg-[#faf6f2] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-xs font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                {withdrawing ? <Loader2 size={14} className="animate-spin" /> : <Landmark size={14} />}
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

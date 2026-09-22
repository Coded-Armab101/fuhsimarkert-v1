'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { formatNaira, nairaToKobo } from '@/utils/money';
import { Wallet, Loader2, Banknote, ArrowDownUp, CheckCircle2, Clock, Landmark } from 'lucide-react';

type Withdrawal = {
  id: string;
  amount_kobo: number;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  status: string;
  request_note?: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  rejected: 'Rejected',
};

export default function SellerWalletPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [balanceKobo, setBalanceKobo] = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  const [amountInput, setAmountInput] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login?redirect=/seller/wallet');
          return;
        }

        const [{ data: wallet }, { data: wds }] = await Promise.all([
          supabase.from('wallets').select('balance').eq('user_id', user.id).maybeSingle(),
          supabase.from('withdrawals')
            .select('id, amount_kobo, bank_name, account_number, account_name, status, request_note, created_at')
            .eq('seller_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        if (wallet) setBalanceKobo(Number(wallet.balance) || 0);
        if (wds) setWithdrawals((wds as Withdrawal[]) || []);
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, [supabase, router]);

  const handleWithdraw = async () => {
    setFeedback(null);

    if (!bankName.trim() || !accountName.trim() || !accountNumber.trim()) {
      setFeedback({ kind: 'error', msg: 'Please fill in your bank name, account name and account number.' });
      return;
    }
    const amountKobo = nairaToKobo(amountInput);
    if (!amountKobo) {
      setFeedback({ kind: 'error', msg: 'Enter a valid withdrawal amount.' });
      return;
    }
    if (amountKobo > balanceKobo) {
      setFeedback({ kind: 'error', msg: 'Amount exceeds your available balance.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountKobo,
          bankName,
          accountName,
          accountNumber,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setBalanceKobo((b) => b - amountKobo);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const refreshed = await supabase
            .from('withdrawals')
            .select('id, amount_kobo, bank_name, account_number, account_name, status, request_note, created_at')
            .eq('seller_id', user.id)
            .order('created_at', { ascending: false });
          if (refreshed.data) setWithdrawals((refreshed.data as Withdrawal[]) || []);
        }
        setAmountInput('');
        setFeedback({ kind: 'ok', msg: `Withdrawal of ₦${formatNaira(amountKobo)} requested.` });
      } else {
        setFeedback({ kind: 'error', msg: data?.error || 'Could not request withdrawal.' });
      }
    } catch {
      setFeedback({ kind: 'error', msg: 'Could not reach the server. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse pt-3"><div className="h-28 rounded-[1.75rem] bg-[#eee4dc]" /><div className="h-40 max-w-xl rounded-[1.75rem] bg-[#f4eee9]" /><div className="h-72 max-w-xl rounded-[1.75rem] bg-[#faf6f2]" /></div>
    );
  }

  const pendingKobo = withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').reduce((sum, w) => sum + w.amount_kobo, 0);
  const paidKobo = withdrawals.filter((w) => w.status === 'paid').reduce((sum, w) => sum + w.amount_kobo, 0);

  return (
    <div className="seller-secondary mx-auto max-w-2xl space-y-5 py-2">
      <button onClick={() => router.push('/seller')} className="text-xs font-bold text-[#81756d] hover:text-[#d8552e]">← Back to seller home</button>
      <div className="rounded-[2rem] bg-gradient-to-br from-[#2e2520] to-[#544038] p-6 text-white shadow-xl">
        <div className="flex items-center justify-between"><div><p className="text-xs text-white/65">FuhsiMarket wallet</p><h1 className="mt-1 text-xl font-black">Your money</h1></div><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Wallet size={20}/></div></div>
        <p className="mt-8 text-xs text-white/65">Available to withdraw</p><p className="mt-1 text-4xl font-black tracking-tight">₦{formatNaira(balanceKobo)}</p>
        <button onClick={() => document.getElementById('withdraw')?.scrollIntoView({behavior:'smooth'})} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] py-3.5 text-sm font-bold"><Banknote size={16}/>Withdraw money</button>
      </div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-[1.5rem] bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs text-[#81756d]"><Clock size={14} className="text-[#ef6b3b]"/>On the way</div><p className="mt-2 text-lg font-black text-[#251d18]">₦{formatNaira(pendingKobo)}</p><p className="mt-1 text-[10px] text-[#81756d]">Withdrawal requests</p></div><div className="rounded-[1.5rem] bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs text-[#81756d]"><CheckCircle2 size={14} className="text-[#17805b]"/>Paid out</div><p className="mt-2 text-lg font-black text-[#251d18]">₦{formatNaira(paidKobo)}</p><p className="mt-1 text-[10px] text-[#81756d]">All-time withdrawals</p></div></div>

      {/* BALANCE CARD */}
      <div className="hidden">
        <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Available Balance</p>
        <p className="text-4xl font-black text-emerald-400 font-mono mt-1">
          ₦{formatNaira(balanceKobo)}
        </p>
        <p className="text-[11px] text-neutral-500 mt-1 font-mono">
          {withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').length} request(s) in progress
        </p>
      </div>

      {/* WITHDRAW FORM */}
      <div id="withdraw" className="rounded-[1.75rem] bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-[#251d18] flex items-center gap-2">
          <Landmark className="text-[#ef6b3b]" size={16} /> Send to your bank
        </h2>

        {feedback && (
          <div className={`p-3 rounded-xl text-xs font-mono border ${
            feedback.kind === 'ok'
              ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400'
              : 'bg-red-950/20 border-red-900/40 text-red-400'
          }`}>
            {feedback.msg}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-[11px] font-mono text-neutral-400">Amount (₦)</label>
          <input
            type="number"
            min="1"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="e.g. 5000"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-600"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-mono text-neutral-400">Bank Name</label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. GTBank"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-600"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-mono text-neutral-400">Account Name</label>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Full name on account"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-600"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-mono text-neutral-400">Account Number</label>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="10-digit account number"
            inputMode="numeric"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-600"
          />
        </div>

        <button
          onClick={handleWithdraw}
          disabled={submitting}
          className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm py-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 active:scale-95 disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          Request Withdrawal
        </button>
      </div>

      {/* HISTORY */}
      <div className="rounded-[1.75rem] bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-[#251d18] flex items-center gap-2 mb-4">
          <ArrowDownUp className="text-red-500" size={16} /> Withdrawal History
        </h2>

        {withdrawals.length === 0 ? (
          <p className="text-xs text-neutral-500 font-mono">No withdrawals yet.</p>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between border border-neutral-800 rounded-xl p-4">
                <div>
                  <p className="text-base font-mono font-black text-neutral-100">
                    ₦{formatNaira(w.amount_kobo)}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-mono">
                    {w.bank_name || '—'} ••••{w.account_number ? w.account_number.slice(-4) : '—'} ·{' '}
                    {new Date(w.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${
                  w.status === 'paid'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                    : w.status === 'failed' || w.status === 'rejected'
                      ? 'bg-red-950/40 border-red-800/60 text-red-400'
                      : 'bg-amber-950/40 border-amber-800/60 text-amber-400'
                }`}>
                  {w.status === 'paid' ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                  {STATUS_LABEL[w.status] || w.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

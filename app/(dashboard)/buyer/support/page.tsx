'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ReceiptText,
  Send,
  Upload,
} from 'lucide-react';
import {
  SUPPORT_CATEGORIES,
  supportWhatsappUrl,
  type SupportCategory,
} from '@/utils/support';

/**
 * Buyer Support Center. Tickets and payment proof always work; the WhatsApp
 * card is the optional fast channel and disappears when no number is configured.
 */

type Ticket = {
  id: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
  last_message_at: string | null;
};

type TicketMessage = {
  id: number;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
};

type Thread = {
  ticket: { id: string; subject: string; category: string; status: string };
  messages: TicketMessage[];
};

type Evidence = {
  id: string;
  checkout_reference: string;
  buyer_reference: string;
  amount_naira: string | null;
  paid_at: string | null;
  note: string;
  proof_path: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  checkout_status?: string | null;
  expected_total_kobo?: number | null;
};

const WHATSAPP_MESSAGE =
  'Hello FuhsiMarket support, I paid for an order but it has not reflected yet. Please help me verify my payment.';

const CATEGORY_LABEL: Record<SupportCategory, string> = {
  payment: 'Payment',
  order: 'Order',
  product: 'Product',
  account: 'Account',
  other: 'Other',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-[#fff0e9] text-[#b24b25]',
  pending: 'bg-[#fff7df] text-[#8a650f]',
  resolved: 'bg-[#e8f7ed] text-[#237a45]',
  closed: 'bg-[#f1efed] text-[#6f655f]',
  under_review: 'bg-[#fff7df] text-[#8a650f]',
  rejected: 'bg-[#ffede9] text-[#a64221]',
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
        STATUS_STYLE[status] ?? 'bg-[#f1efed] text-[#6f655f]'
      }`}
    >
      {status}
    </span>
  );
}

function Feedback({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  const isError = kind === 'error';
  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
        isError
          ? 'bg-[#fff0e9] text-[#a64221]'
          : 'bg-[#e8f7ed] text-[#237a45]'
      }`}
    >
      {isError ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

function SupportCenter() {
  const searchParams = useSearchParams();
  const referenceParam = firstParam(searchParams.get('reference') ?? undefined);
  const categoryParam = firstParam(searchParams.get('category') ?? undefined);
  const ticketParam = firstParam(searchParams.get('ticket') ?? undefined);
  const isPaymentIntent = Boolean(referenceParam) || categoryParam === 'payment';

  const [category, setCategory] = useState<SupportCategory>(
    categoryParam === 'payment' ? 'payment' : 'other',
  );
  const [subject, setSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [ticketFormError, setTicketFormError] = useState('');
  const [ticketFormSuccess, setTicketFormSuccess] = useState('');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const [checkoutReference, setCheckoutReference] = useState(referenceParam);
  const [buyerReference, setBuyerReference] = useState('');
  const [amountNaira, setAmountNaira] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [note, setNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState('');
  const [proofSuccess, setProofSuccess] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);

  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError('');
    try {
      const response = await fetch('/api/support/tickets', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not load tickets.');
      setTickets((payload.tickets ?? []) as Ticket[]);
    } catch (error) {
      setTicketsError(error instanceof Error ? error.message : 'Could not load tickets.');
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  const loadEvidence = useCallback(async () => {
    setEvidenceLoading(true);
    try {
      const response = await fetch('/api/payment-evidence', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setEvidence((payload.submissions ?? []) as Evidence[]);
    } catch (error) {
      console.warn('[support] could not load evidence', error);
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  const openTicket = useCallback(async (id: string) => {
    setSelectedId(id);
    setThreadLoading(true);
    setThreadError('');
    setReply('');
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(id)}/messages`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not load this conversation.');
      setThread(payload as Thread);
    } catch (error) {
      setThread(null);
      setThreadError(error instanceof Error ? error.message : 'Could not load this conversation.');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // Deferred like the dashboard layouts: data loading and URL-driven defaults
  // are external synchronisation, not synchronous work in the effect body.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTickets();
      void loadEvidence();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTickets, loadEvidence]);

  useEffect(() => {
    if (!isPaymentIntent) return;
    const timer = window.setTimeout(() => {
      setCategory('payment');
      setSubject(
        referenceParam
          ? `Payment not reflected — ${referenceParam}`.slice(0, 160)
          : 'Payment not reflected after checkout',
      );
      setTicketMessage(
        `I completed a payment but my order has not appeared. ${
          referenceParam ? `Checkout reference: ${referenceParam}. ` : ''
        }I have attached the payment proof below for verification.`,
      );
      if (referenceParam) setCheckoutReference(referenceParam);
      document.getElementById('payment-proof')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isPaymentIntent, referenceParam]);

  useEffect(() => {
    if (!ticketParam) return;
    const timer = window.setTimeout(() => {
      void openTicket(ticketParam);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ticketParam, openTicket]);

  async function createTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setTicketFormError('');
    setTicketFormSuccess('');
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subject, message: ticketMessage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not create your ticket.');

      const created = payload.ticket as Ticket;
      setTickets((current) => [created, ...current]);
      setSubject('');
      setTicketMessage('');
      setTicketFormSuccess('Ticket created. Our support team will reply here.');
      await openTicket(created.id);
      void loadTickets();
    } catch (error) {
      setTicketFormError(error instanceof Error ? error.message : 'Could not create your ticket.');
    } finally {
      setCreating(false);
    }
  }

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setSendingReply(true);
    setThreadError('');
    try {
      const response = await fetch(
        `/api/support/tickets/${encodeURIComponent(selectedId)}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: reply }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not send your reply.');

      if (payload.message) {
        setThread((current) =>
          current
            ? {
                ...current,
                ticket: { ...current.ticket, status: 'pending' },
                messages: [...current.messages, payload.message as TicketMessage],
              }
            : current,
        );
      }
      setReply('');
      void loadTickets();
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : 'Could not send your reply.');
    } finally {
      setSendingReply(false);
    }
  }

  async function submitProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProofError('');
    setProofSuccess('');

    if (!/^[A-Za-z0-9_-]{1,200}$/.test(checkoutReference.trim())) {
      setProofError('Enter a valid checkout reference.');
      return;
    }
    if (!buyerReference.trim() || buyerReference.trim().length > 200) {
      setProofError('Enter your bank/payment reference (1–200 characters).');
      return;
    }
    if (note.trim().length < 10 || note.trim().length > 2000) {
      setProofError('Add a note of at least 10 characters (maximum 2000).');
      return;
    }
    if (proofFile) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type)) {
        setProofError('Proof images must be JPG, PNG or WEBP.');
        return;
      }
      if (proofFile.size > 4 * 1024 * 1024) {
        setProofError('Proof image must be 4MB or smaller.');
        return;
      }
    }

    setSubmittingProof(true);
    try {
      const form = new FormData();
      form.append('checkout_reference', checkoutReference.trim());
      form.append('buyer_reference', buyerReference.trim());
      form.append('amount_naira', amountNaira.trim());
      form.append('paid_at', paidAt.trim());
      form.append('note', note.trim());
      if (proofFile) form.append('proof', proofFile);

      const response = await fetch('/api/payment-evidence', {
        method: 'POST',
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not submit your proof.');

      setProofSuccess('Payment proof sent. Support will review it and update you here.');
      setNote('');
      setProofFile(null);
      const fileInput = document.getElementById('payment-proof-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      void loadEvidence();
    } catch (error) {
      setProofError(error instanceof Error ? error.message : 'Could not submit your proof.');
    } finally {
      setSubmittingProof(false);
    }
  }

  const whatsappUrl = supportWhatsappUrl(WHATSAPP_MESSAGE);

  return (
    <div className="buyer-secondary mx-auto max-w-3xl space-y-5 py-2 pb-28">
      <Link
        href="/buyer"
        className="inline-flex items-center gap-2 text-xs font-bold text-[#81756d] hover:text-[#d8552e]"
      >
        ← Back to home
      </Link>

      <header className="rounded-[1.75rem] bg-gradient-to-br from-[#ff9a55] to-[#e85f35] p-6 text-white shadow-sm">
        <div className="flex items-center gap-2 text-white/90">
          <MessageCircle size={22} />
          <span className="text-[10px] font-black uppercase tracking-widest">Support centre</span>
        </div>
        <h1 className="mt-3 text-2xl font-black">We’re here to help</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/85">
          Chat with us on WhatsApp for a quick answer, or open a ticket so the team can follow your
          issue until it is resolved. Paid but your order did not appear? Submit your payment proof
          below with the checkout reference.
        </p>
      </header>

      {whatsappUrl && (
        <section className="rounded-[1.5rem] border border-[#d8f0df] bg-[#f2fbf5] p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-[#06251a]">
                <MessageCircle size={20} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-sm font-black text-[#1c4b32]">Need a quick answer?</h2>
                <p className="mt-1 text-xs text-[#3f6b52]">
                  Message support on WhatsApp. Keep your payment reference handy.
                </p>
              </div>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full bg-[#25D366] px-4 py-2.5 text-center text-xs font-bold text-[#06251a] transition-transform hover:scale-[1.03] active:scale-95"
            >
              Chat on WhatsApp
            </a>
          </div>
        </section>
      )}

      <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-[#251d18]">New support ticket</h2>
        <p className="mt-1 text-xs text-[#81756d]">
          Give us enough detail to help on the first reply.
        </p>
        <form onSubmit={createTicket} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold text-[#65584f]">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportCategory)}
              className="mt-1 w-full rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
            >
              {SUPPORT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {CATEGORY_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-[#65584f]">Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={160}
              required
              placeholder="e.g. Payment not reflected"
              className="mt-1 w-full rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-[#65584f]">Message</span>
            <textarea
              value={ticketMessage}
              onChange={(event) => setTicketMessage(event.target.value)}
              maxLength={4000}
              required
              rows={4}
              placeholder="Tell us what happened, when it happened, and any reference numbers."
              className="mt-1 w-full resize-y rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#ef6b3b] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#d8552e] disabled:opacity-60 sm:w-auto"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {creating ? 'Submitting…' : 'Submit ticket'}
          </button>
          {ticketFormError && <Feedback kind="error">{ticketFormError}</Feedback>}
          {ticketFormSuccess && <Feedback kind="success">{ticketFormSuccess}</Feedback>}
        </form>
      </section>

      <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black text-[#251d18]">Your tickets</h2>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="text-[11px] font-bold text-[#d8552e] hover:underline"
          >
            Refresh
          </button>
        </div>
        {ticketsError && <Feedback kind="error">{ticketsError}</Feedback>}
        {ticketsLoading ? (
          <div className="mt-3 space-y-2 animate-pulse">
            {[1, 2].map((item) => (
              <div key={item} className="h-20 rounded-2xl bg-[#f4eee9]" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#fffaf6] p-5 text-center text-xs text-[#81756d]">
            No tickets yet. Use the form above if you need help.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => void openTicket(ticket.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                    selectedId === ticket.id
                      ? 'border-[#ef6b3b] bg-[#fff7f3]'
                      : 'border-[#eee6de] bg-[#fffdfa] hover:border-[#efc8b6]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#251d18]">{ticket.subject}</p>
                      <p className="mt-0.5 text-[10px] font-mono text-[#9b8f86]">
                        {CATEGORY_LABEL[ticket.category as SupportCategory] ?? ticket.category} ·{' '}
                        {formatDate(ticket.updated_at)}
                      </p>
                    </div>
                    <StatusPill status={ticket.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-[#81756d]">
                    {ticket.last_message || ticket.message}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-[#a19790]">
                    {ticket.message_count} message{ticket.message_count === 1 ? '' : 's'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedId && (
        <section className="rounded-[1.5rem] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-[#251d18]">Conversation</h2>
            {thread && <StatusPill status={thread.ticket.status} />}
          </div>
          {threadLoading ? (
            <div className="mt-3 flex items-center justify-center gap-2 py-8 text-xs text-[#81756d]">
              <Loader2 size={16} className="animate-spin" /> Loading conversation…
            </div>
          ) : threadError ? (
            <Feedback kind="error">{threadError}</Feedback>
          ) : thread ? (
            <>
              <div className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto rounded-2xl bg-[#fffdfa] p-3">
                {thread.messages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#81756d]">
                    No replies yet. Support will respond here.
                  </p>
                ) : (
                  thread.messages.map((item) => {
                    const fromSupport = item.sender_role === 'admin' || item.sender_role === 'system';
                    return (
                      <div
                        key={item.id}
                        className={`flex ${fromSupport ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                            fromSupport
                              ? 'bg-[#f4eee9] text-[#443832]'
                              : 'bg-[#ef6b3b] text-white'
                          }`}
                        >
                          <p className="mb-1 text-[10px] font-black uppercase opacity-80">
                            {item.sender_role === 'admin' ? 'Support team' : item.sender_role}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{item.message}</p>
                          <p className="mt-1 text-[9px] opacity-70">{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form onSubmit={sendReply} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={4000}
                  rows={2}
                  placeholder="Type your reply…"
                  className="w-full resize-y rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !reply.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#2e2520] px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {sendingReply ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Send
                </button>
              </form>
            </>
          ) : null}
        </section>
      )}

      <section id="payment-proof" className="scroll-mt-20 rounded-[1.5rem] bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fff0e9] text-[#d8552e]">
            <ReceiptText size={20} />
          </span>
          <div>
            <h2 className="text-sm font-black text-[#251d18]">Submit payment proof</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#81756d]">
              If you were charged but your order did not appear, send the checkout reference and a
              photo of your payment receipt. Images are stored privately and only support staff can
              view them.
            </p>
          </div>
        </div>

        <form onSubmit={submitProof} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-bold text-[#65584f]">Checkout reference</span>
              <input
                value={checkoutReference}
                onChange={(event) => setCheckoutReference(event.target.value)}
                maxLength={200}
                required
                placeholder="e.g. FUHSI-XXXX"
                className="mt-1 w-full rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-[#ef6b3b]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-[#65584f]">Your payment reference</span>
              <input
                value={buyerReference}
                onChange={(event) => setBuyerReference(event.target.value)}
                maxLength={200}
                required
                placeholder="Bank transfer / receipt reference"
                className="mt-1 w-full rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-[#65584f]">Amount paid (optional)</span>
              <input
                value={amountNaira}
                onChange={(event) => setAmountNaira(event.target.value)}
                maxLength={40}
                placeholder="e.g. ₦5,500"
                className="mt-1 w-full rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-[#65584f]">Date/time paid (optional)</span>
              <input
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                maxLength={40}
                placeholder="e.g. Today, 2:15pm"
                className="mt-1 w-full rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold text-[#65584f]">What happened?</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              required
              rows={3}
              placeholder="Explain when you paid and why you need help."
              className="mt-1 w-full resize-y rounded-xl border border-[#e6dcd3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ef6b3b]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-[#65584f]">Receipt image (optional)</span>
            <span className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-[#e0d2c6] bg-[#fffdfa] px-3 py-2.5 text-xs text-[#81756d]">
              <Upload size={16} className="shrink-0 text-[#d8552e]" />
              <input
                id="payment-proof-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                className="w-full text-[11px] file:mr-2 file:rounded-full file:border-0 file:bg-[#fff0e9] file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-[#b24b25]"
              />
            </span>
            <span className="mt-1 block text-[10px] text-[#a19790]">JPG, PNG or WEBP, up to 4MB.</span>
          </label>
          <button
            type="submit"
            disabled={submittingProof}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2e2520] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#443832] disabled:opacity-60 sm:w-auto"
          >
            {submittingProof ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {submittingProof ? 'Sending…' : 'Submit proof'}
          </button>
          {proofError && <Feedback kind="error">{proofError}</Feedback>}
          {proofSuccess && <Feedback kind="success">{proofSuccess}</Feedback>}
        </form>

        <div className="mt-5 border-t border-[#f0e9e3] pt-4">
          <h3 className="text-xs font-black text-[#251d18]">Previous submissions</h3>
          {evidenceLoading ? (
            <div className="mt-2 h-12 animate-pulse rounded-xl bg-[#f4eee9]" />
          ) : evidence.length === 0 ? (
            <p className="mt-2 text-xs text-[#81756d]">No payment proof submitted yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {evidence.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-[#eee6de] bg-[#fffdfa] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-bold text-[#443832]">
                        {item.checkout_reference}
                      </p>
                      <p className="mt-1 text-[11px] text-[#81756d]">
                        {formatDate(item.created_at)}
                        {item.proof_path ? ' · Proof attached' : ''}
                      </p>
                    </div>
                    <StatusPill status={item.status} />
                  </div>
                  {item.admin_note && (
                    <p className="mt-2 rounded-xl bg-[#fff7f3] px-3 py-2 text-[11px] text-[#8b5540]">
                      Support: {item.admin_note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="buyer-secondary mx-auto max-w-3xl space-y-4 py-2">
          <div className="h-40 animate-pulse rounded-[1.75rem] bg-[#eee4dc]" />
          <div className="h-64 animate-pulse rounded-[1.5rem] bg-[#f4eee9]" />
        </div>
      }
    >
      <SupportCenter />
    </Suspense>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { formatNaira } from '@/utils/money';
import {
  ShieldCheck,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  HardDrive,
  Check,
  X,
  IdCard,
  Video,
  Eye,
  Package,
  Clock,
  TriangleAlert,
  LayoutDashboard,
  Users,
  CreditCard,
  RefreshCw,
  Sun,
  Moon,
  Wallet,
  Megaphone,
  RotateCcw,
  CalendarDays,
  ClipboardList,
  Mail,
  MessageCircle,
  Receipt,
  Store,
  Truck,
} from 'lucide-react';
import OverviewTab from './_components/OverviewTab';
import MoneyTab from './_components/MoneyTab';
import PeopleTab from './_components/PeopleTab';
import { formatDateTime, fullNaira } from './_components/ui';
import { ADMIN_RANGE_OPTIONS, adminRangeQuery, type AdminRange } from '@/utils/admin/date-range';
import type { AdminOverview, AdminTab } from '@/utils/admin/metrics';
import { variantLabel } from '@/utils/variants';
import BroadcastsTab from './_components/BroadcastsTab';
import { useNotifications } from '@/components/NotificationProvider';
import { safeImageSrc } from '@/utils/safeImage';

type Withdrawal = {
  id: string;
  seller_id: string;
  amount_kobo: number;
  transfer_fee_kobo?: number;
  wallet_debit_kobo?: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'rejected';
  transfer_status?: string | null;
  transfer_reference?: string | null;
  transfer_error?: string | null;
  manual_reconciled_at?: string | null;
  manual_reconcile_note?: string | null;
  request_note?: string | null;
  created_at: string;
  processed_at?: string | null;
  seller?: { full_name?: string } | null;
};

type SellerStorage = {
  id: string;
  full_name?: string;
  storage_quota: number | null;
};

type SellerVerification = {
  id: string;
  full_name?: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  status: 'pending' | 'rejected' | null;
  rejectReason: string | null;
  consentAt: string | null;
  consentVersion: string | null;
  isApproved: boolean;
  urls: { student_id_url: string | null; verification_video_url: string | null };
};

type FulfilmentItem = {
  orderId: string;
  product: { id: string; title: string; image_url?: string | null } | null;
  quantity: number;
  amountKobo: number;
  status: string;
  statusChangedAt: string | null;
  createdAt: string;
  slow: boolean;
  size?: string | null;
  color?: string | null;
  variantKey?: string | null;
  disputeReason?: string | null;
  disputeOpenedAt?: string | null;
  returnRequired: boolean;
  returnReceivedAt: string | null;
  returnConfirmationSource?: string | null;
};

/** One packing group = one order + one seller, with all that seller's product lines. */
type FulfilmentGroup = {
  order_ref: string;
  sellerId: string;
  sellerName: string;
  delivery_code: string;
  buyer: { name: string; id: string };
  createdAt: string;
  groupStatus: string;
  deliveryFeeKobo: number;
  items: FulfilmentItem[];
};

type PaymentAttempt = {
  reference: string;
  buyer_id: string;
  buyer_email: string | null;
  status: 'initialized' | 'initialize_failed' | 'confirmed_paystack' | 'confirmed_manual';
  item_count: number;
  expected_total_kobo: number;
  gateway_charge_kobo: number;
  wallet_kobo: number;
  paystack_checked_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmation_note: string | null;
  created_at: string;
};

type SupportTicket = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  subject: string;
  category: string | null;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
  last_message_at: string | null;
};

type PaymentEvidence = {
  id: string;
  checkout_reference: string;
  buyer_id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_reference: string;
  amount_naira: number | null;
  paid_at: string | null;
  note: string | null;
  proof_path: string | null;
  proof_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  checkout_status: string | null;
  expected_total_kobo: number;
};

type SellerActivitySeller = {
  id: string;
  name: string;
  isSuspended: boolean;
  productCount: number;
  orderCount: number;
  disputeCount: number;
  complaintCount: number;
  paymentIssueCount: number;
  moderationCount: number;
  lastActivityAt: string | null;
};

type SellerActivityDetail = {
  seller: {
    id: string;
    name: string;
    isSuspended: boolean;
    suspensionReason: string | null;
    isApprovedSeller: boolean;
    verificationStatus: string | null;
    createdAt: string;
    isPickupStaff: boolean;
  };
  products: Array<{ id: string; title: string; priceKobo: number; stock: number; createdAt: string }>;
  orders: Array<{ id: string; ref: string; buyerName: string; status: string; amountKobo: number; createdAt: string }>;
  complaints: Array<{ id: string; source: string; label: string; snippet: string | null; rating: number | null; createdAt: string }>;
  paymentIssues: Array<{ reference: string; status: string; buyerEmail: string | null; expectedTotalKobo: number; createdAt: string }>;
  moderation: Array<{ id: string; action: string; reason: string | null; createdAt: string; adminName: string | null }>;
  reviewNotes: Array<{ id: string; note: string; createdAt: string; adminName: string | null }>;
};

type SellerActivityData = {
  sellers: SellerActivitySeller[];
  selected: SellerActivityDetail | null;
};

type PickupEvent = {
  id: string;
  staffId: string;
  staffName: string;
  orderRef: string;
  deliveryCode: string;
  eventType: string;
  note: string | null;
  createdAt: string;
};

type PickupStaff = { id: string; name: string; isPickupStaff: boolean };

type PickupStaffChange = {
  id: string;
  userId: string;
  userName: string;
  action: string;
  reason: string | null;
  createdAt: string;
  adminName: string | null;
};

type PickupData = {
  events: PickupEvent[];
  staff: PickupStaff[];
  staffChanges: PickupStaffChange[];
};

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  initialized: 'bg-amber-950/60 text-amber-300 border-amber-800',
  initialize_failed: 'bg-red-950/60 text-red-300 border-red-800',
  confirmed_paystack: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  confirmed_manual: 'bg-sky-950/60 text-sky-300 border-sky-800',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-950/60 text-amber-300 border-amber-800',
  processing: 'bg-blue-950/60 text-blue-300 border-blue-800',
  paid: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  failed: 'bg-red-950/60 text-red-300 border-red-800',
  rejected: 'bg-neutral-900 text-neutral-400 border-neutral-800',
};

const SUPPORT_STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-950/60 text-amber-300 border-amber-800',
  pending: 'bg-blue-950/60 text-blue-300 border-blue-800',
  replied: 'bg-sky-950/60 text-sky-300 border-sky-800',
  resolved: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  closed: 'bg-neutral-900 text-neutral-400 border-neutral-800',
};

const EVIDENCE_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-950/60 text-amber-300 border-amber-800',
  under_review: 'bg-blue-950/60 text-blue-300 border-blue-800',
  resolved: 'bg-emerald-950/60 text-emerald-300 border-emerald-800',
  rejected: 'bg-red-950/60 text-red-300 border-red-800',
};

function elapsedLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

export default function AdminDashboardPage() {
  const supabase = createClient();
  const { notify, confirm } = useNotifications();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [range, setRange] = useState<AdminRange>('all');
  const [refreshToken, setRefreshToken] = useState(0);
  const rangeQuery = () => adminRangeQuery(range);
  // Read the saved theme during the first client render. The main board is not
  // part of the initial server HTML (admin access is checked client-side), so
  // this cannot cause a hydration mismatch.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('fuhsi_admin_theme') === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    window.localStorage.setItem('fuhsi_admin_theme', theme);
  }, [theme]);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [oLoading, setOLoading] = useState(true);
  const [oError, setOError] = useState<string | null>(null);

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [wLoading, setWLoading] = useState(true);
  const [wError, setWError] = useState<string | null>(null);
  const [wMessage, setWMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [reconcileWithdrawal, setReconcileWithdrawal] = useState<Withdrawal | null>(null);
  const [reconcileNote, setReconcileNote] = useState('');
  const [reconcileChecked, setReconcileChecked] = useState(false);
  const [savingReconciliation, setSavingReconciliation] = useState(false);

  const [sellers, setSellers] = useState<SellerStorage[]>([]);
  const [sLoading, setSLoading] = useState(true);
  // Inline editing: sellerId -> draft MB text
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingQuota, setSavingQuota] = useState<string | null>(null);
  const [sMessage, setSMessage] = useState<string | null>(null);

  const [verifications, setVerifications] = useState<SellerVerification[]>([]);
  const [vLoading, setVLoading] = useState(true);
  const [vError, setVError] = useState<string | null>(null);
  const [actingV, setActingV] = useState<string | null>(null);
  // sellerId -> reject reason draft
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const [fulfilments, setFulfilments] = useState<FulfilmentGroup[]>([]);
  const [fLoading, setFLoading] = useState(true);
  const [fError, setFError] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'successful' | 'pending' | 'disputed'>('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [returnOverride, setReturnOverride] = useState<FulfilmentItem | null>(null);
  const [returnOverrideReason, setReturnOverrideReason] = useState('');
  const [savingReturnOverride, setSavingReturnOverride] = useState(false);

  const [payments, setPayments] = useState<PaymentAttempt[]>([]);
  const [pLoading, setPLoading] = useState(true);
  const [pError, setPError] = useState<string | null>(null);
  const [actingPayment, setActingPayment] = useState<string | null>(null);
  const [manualTarget, setManualTarget] = useState<PaymentAttempt | null>(null);
  const [manualNote, setManualNote] = useState('');
  const [manualAttested, setManualAttested] = useState(false);

  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(true);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [replyingTicket, setReplyingTicket] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [actingTicket, setActingTicket] = useState<string | null>(null);

  const [evidence, setEvidence] = useState<PaymentEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceDrafts, setEvidenceDrafts] = useState<
    Record<string, { status: 'under_review' | 'resolved' | 'rejected'; adminNote: string }>
  >({});
  const [actingEvidence, setActingEvidence] = useState<string | null>(null);

  const [sellerActivity, setSellerActivity] = useState<SellerActivityData>({ sellers: [], selected: null });
  const [sellerActivityId, setSellerActivityId] = useState<string | null>(null);
  const [sellerActivityLoading, setSellerActivityLoading] = useState(true);
  const [sellerActivityError, setSellerActivityError] = useState<string | null>(null);

  const [pickup, setPickup] = useState<PickupData>({ events: [], staff: [], staffChanges: [] });
  const [pickupLoading, setPickupLoading] = useState(true);
  const [pickupError, setPickupError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();
      setIsAdmin(profile?.is_admin === true);
    })();
  }, [supabase]);

  const loadWithdrawals = async () => {
    setWLoading(true);
    setWError(null);
    try {
      const res = await fetch(`/api/admin/withdrawals${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setWithdrawals(data.withdrawals || []);
    } catch (err) {
      setWError(err instanceof Error ? err.message : 'Failed to load withdrawals');
    } finally {
      setWLoading(false);
    }
  };

  const loadVerifications = async () => {
    setVLoading(true);
    setVError(null);
    try {
      const res = await fetch(`/api/admin/verifications${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setVerifications(data.sellers || []);
    } catch (err) {
      setVError(err instanceof Error ? err.message : 'Failed to load verifications');
    } finally {
      setVLoading(false);
    }
  };

  const actVerification = async (action: 'approve' | 'reject', sellerId: string) => {
    if (action === 'reject' && !(rejectReasons[sellerId] || '').trim()) {
      notify('Enter a rejection reason first.', { tone: 'warning' });
      return;
    }
    setActingV(sellerId);
    setVError(null);
    try {
      const res = await fetch('/api/admin/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sellerId,
          rejectReason: action === 'reject' ? rejectReasons[sellerId] : '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (action === 'reject') {
        notify('Rejected. They can re-record and resubmit; the activation fee is kept.', { tone: 'success' });
      } else {
        notify('Seller verification approved.', { tone: 'success' });
      }
      await loadVerifications();
    } catch (err) {
      setVError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActingV(null);
    }
  };

  const loadSellers = async () => {
    setSLoading(true);
    try {
      const res = await fetch(`/api/admin/storage${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setSellers(data.sellers || []);
      const init: Record<string, string> = {};
      for (const s of data.sellers || []) {
        init[s.id] = s.storage_quota != null ? String(Math.round(s.storage_quota / 1024 / 1024)) : '';
      }
      setDrafts(init);
    } finally {
setSLoading(false);
    }
  };

  const loadFulfilments = async () => {
    setFLoading(true);
    setFError(null);
    try {
      const res = await fetch(`/api/admin/orders${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setFulfilments(data.groups || []);
    } catch (err) {
      setFError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setFLoading(false);
    }
  };

  const loadPayments = async () => {
    setPLoading(true);
    setPError(null);
    try {
      const res = await fetch(`/api/admin/payments${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setPayments(data.attempts || []);
    } catch (err) {
      setPError(err instanceof Error ? err.message : 'Failed to load payment attempts');
    } finally {
      setPLoading(false);
    }
  };

  const loadOverview = async () => {
    setOLoading(true);
    setOError(null);
    try {
      const res = await fetch(`/api/admin/overview${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setOverview(data as AdminOverview);
    } catch (err) {
      setOError(err instanceof Error ? err.message : 'Failed to load overview');
    } finally {
      setOLoading(false);
    }
  };

  const loadSupport = async () => {
    setSupportLoading(true);
    setSupportError(null);
    try {
      const res = await fetch(`/api/admin/support${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setSupportTickets(data.tickets || []);
    } catch (err) {
      setSupportError(err instanceof Error ? err.message : 'Failed to load support tickets');
    } finally {
      setSupportLoading(false);
    }
  };

  const loadEvidence = async () => {
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const res = await fetch(`/api/admin/payment-evidence${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const submissions: PaymentEvidence[] = data.submissions || [];
      setEvidence(submissions);
      const drafts: Record<string, { status: 'under_review' | 'resolved' | 'rejected'; adminNote: string }> = {};
      for (const item of submissions) {
        drafts[item.id] = {
          status: item.status === 'resolved' || item.status === 'rejected' ? item.status : 'under_review',
          adminNote: item.admin_note || '',
        };
      }
      setEvidenceDrafts(drafts);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Failed to load payment evidence');
    } finally {
      setEvidenceLoading(false);
    }
  };

  const loadSellerActivity = async (sellerId: string | null = sellerActivityId) => {
    setSellerActivityLoading(true);
    setSellerActivityError(null);
    try {
      const params = new URLSearchParams();
      if (sellerId) params.set('sellerId', sellerId);
      if (range !== 'all') params.set('range', range);
      const query = params.toString();
      const res = await fetch(`/api/admin/seller-activity${query ? `?${query}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setSellerActivity({ sellers: data.sellers || [], selected: data.selected || null });
    } catch (err) {
      setSellerActivityError(err instanceof Error ? err.message : 'Failed to load seller activity');
    } finally {
      setSellerActivityLoading(false);
    }
  };

  const loadPickup = async () => {
    setPickupLoading(true);
    setPickupError(null);
    try {
      const res = await fetch(`/api/admin/pickup${rangeQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setPickup({ events: data.events || [], staff: data.staff || [], staffChanges: data.staffChanges || [] });
    } catch (err) {
      setPickupError(err instanceof Error ? err.message : 'Failed to load pickup logs');
    } finally {
      setPickupLoading(false);
    }
  };

  const openSellerReview = (userId: string) => {
    setSellerActivityId(userId);
    setTab('seller_activity');
    void loadSellerActivity(userId);
  };

  const refreshAll = () => {
    setRefreshToken((token) => token + 1);
    loadOverview();
    loadWithdrawals();
    loadSellers();
    loadVerifications();
    loadFulfilments();
    loadPayments();
    loadSupport();
    loadEvidence();
    loadSellerActivity();
    loadPickup();
  };

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview();
    loadWithdrawals();
    loadSellers();
    loadVerifications();
    loadFulfilments();
    loadPayments();
    loadSupport();
    loadEvidence();
    loadSellerActivity();
    loadPickup();
    // Loaders are recreated on every render; depending on them would reload the
    // whole console on each state update. `range` is the real trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, range]);

  const act = async (action: 'approve' | 'reject', id: string) => {
    if (action === 'reject') {
      const accepted = await confirm({
        title: 'Return this withdrawal to the wallet?',
        message: 'Reject only when no bank transfer can still arrive. The server will verify any Paystack reference before returning the held amount.',
        confirmLabel: 'Reject and return funds',
        tone: 'danger',
      });
      if (!accepted) return;
    }
    setActingId(id);
    setWError(null);
    setWMessage(null);
    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, withdrawalId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (data.message) setWMessage(data.message);
      if (data.status === 'paid') notify('Withdrawal paid successfully.', { tone: 'success' });
      if (data.status === 'rejected') notify('Withdrawal rejected and returned to the wallet.', { tone: 'success' });
      await loadWithdrawals();
    } catch (err) {
      setWError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  };

  const fulfilmentSellers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const group of fulfilments) {
      byId.set(group.sellerId, group.sellerName);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [fulfilments]);

  const filteredFulfilments = useMemo(() => {
    const successful = new Set(['completed', 'confirmed', 'delivered']);
    const pending = new Set(['in_escrow', 'packing', 'ready_for_pickup']);
    return fulfilments.filter((group) => {
      if (sellerFilter !== 'all' && group.sellerId !== sellerFilter) return false;
      if (orderFilter === 'successful') return successful.has(group.groupStatus);
      if (orderFilter === 'pending') return pending.has(group.groupStatus);
      if (orderFilter === 'disputed') return group.groupStatus === 'disputed' || group.items.some((item) => item.status === 'disputed');
      return true;
    });
  }, [fulfilments, orderFilter, sellerFilter]);

  const orderFilterCount = (filter: 'successful' | 'pending' | 'disputed') => {
    const successful = new Set(['completed', 'confirmed', 'delivered']);
    const pending = new Set(['in_escrow', 'packing', 'ready_for_pickup']);
    return fulfilments.filter((group) => {
      if (filter === 'successful') return successful.has(group.groupStatus);
      if (filter === 'pending') return pending.has(group.groupStatus);
      return group.groupStatus === 'disputed' || group.items.some((item) => item.status === 'disputed');
    }).length;
  };

  const confirmReturnAsAdmin = async () => {
    if (!returnOverride) return;
    if (returnOverrideReason.trim().length < 10) {
      notify('Add an evidence note of at least 10 characters.', { tone: 'warning' });
      return;
    }
    setSavingReturnOverride(true);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_return',
          orderId: returnOverride.orderId,
          reason: returnOverrideReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not confirm the return.');
      notify('Return evidence accepted. The buyer can continue the protected refund.', { tone: 'success' });
      setReturnOverride(null);
      setReturnOverrideReason('');
      await loadFulfilments();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not confirm the return.', { tone: 'error' });
    } finally {
      setSavingReturnOverride(false);
    }
  };

  const saveQuota = async (sellerId: string) => {
    setSavingQuota(sellerId);
    setSMessage(null);
    try {
      const mb = drafts[sellerId]?.trim();
      const res = await fetch('/api/admin/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, quotaMb: mb === '' ? 0 : Number(mb) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSMessage('Quota updated.');
      await loadSellers();
    } catch (err) {
      setSMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingQuota(null);
    }
  };

  const saveReconciliation = async () => {
    if (!reconcileWithdrawal) return;
    if (!reconcileChecked) {
      notify('Confirm that you checked this exact reference in Paystack.', { tone: 'warning' });
      return;
    }
    if (reconcileNote.trim().length < 10) {
      notify('Add a reconciliation note of at least 10 characters.', { tone: 'warning' });
      return;
    }
    setSavingReconciliation(true);
    setWError(null);
    try {
      const response = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_not_started',
          withdrawalId: reconcileWithdrawal.id,
          note: reconcileNote.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not reconcile this transfer.');
      setWMessage(data.message || 'Transfer recorded as not started.');
      notify('Reconciliation recorded. Reject can now safely return the wallet funds.', { tone: 'success' });
      setReconcileWithdrawal(null);
      setReconcileNote('');
      setReconcileChecked(false);
      await loadWithdrawals();
    } catch (error) {
      setWError(error instanceof Error ? error.message : 'Could not reconcile this transfer.');
    } finally {
      setSavingReconciliation(false);
    }
  };

  const recheckPayment = async (reference: string) => {
    setActingPayment(reference);
    setPError(null);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recheck', reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not re-check this payment.');
      if (data.ok) {
        notify(data.message || 'Payment confirmed. The order is now in escrow.', { tone: 'success' });
      } else {
        notify(data.message || 'Paystack has not confirmed this payment yet.', { tone: 'warning' });
      }
      await loadPayments();
    } catch (err) {
      setPError(err instanceof Error ? err.message : 'Could not re-check this payment.');
    } finally {
      setActingPayment(null);
    }
  };

  const confirmPaymentManually = async () => {
    if (!manualTarget) return;
    if (manualNote.trim().length < 10) {
      notify('Add an evidence note of at least 10 characters.', { tone: 'warning' });
      return;
    }
    if (!manualAttested) {
      notify('Confirm that you verified the transfer before continuing.', { tone: 'warning' });
      return;
    }
    setActingPayment(manualTarget.reference);
    setPError(null);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_manual',
          reference: manualTarget.reference,
          note: manualNote.trim(),
          attested: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not confirm this payment.');
      notify(data.message || 'Payment confirmed. The buyer’s order is now in escrow.', { tone: 'success' });
      setManualTarget(null);
      setManualNote('');
      setManualAttested(false);
      await loadPayments();
    } catch (err) {
      setPError(err instanceof Error ? err.message : 'Could not confirm this payment.');
    } finally {
      setActingPayment(null);
    }
  };

  const actOnSupportTicket = async (ticketId: string, action: 'reply' | 'resolve' | 'close') => {
    const message = action === 'reply' ? (replyDrafts[ticketId] || '').trim() : '';
    if (action === 'reply' && !message) {
      notify('Write a reply before sending it.', { tone: 'warning' });
      return;
    }
    setActingTicket(ticketId);
    setSupportError(null);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update this ticket.');
      notify(
        action === 'reply'
          ? 'Reply sent to the requester.'
          : action === 'resolve'
            ? 'Ticket marked as resolved.'
            : 'Ticket closed.',
        { tone: 'success' },
      );
      if (action === 'reply') {
        setReplyDrafts((drafts) => ({ ...drafts, [ticketId]: '' }));
        setReplyingTicket(null);
      }
      await loadSupport();
    } catch (err) {
      setSupportError(err instanceof Error ? err.message : 'Could not update this ticket.');
    } finally {
      setActingTicket(null);
    }
  };

  const saveEvidenceReview = async (submission: PaymentEvidence) => {
    const draft = evidenceDrafts[submission.id];
    if (!draft) return;
    setActingEvidence(submission.id);
    setEvidenceError(null);
    try {
      const res = await fetch('/api/admin/payment-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: submission.id,
          status: draft.status,
          adminNote: draft.adminNote.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save this review.');
      notify('Payment evidence review saved.', { tone: 'success' });
      await loadEvidence();
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Could not save this review.');
    } finally {
      setActingEvidence(null);
    }
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-500" size={24} />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <ShieldCheck size={32} className="mx-auto text-neutral-700" />
          <p className="text-sm text-neutral-400">You do not have access to the admin dashboard.</p>
        </div>
      </div>
    );
  }

  const pendingCount = withdrawals.filter((w) => w.status === 'pending').length;
  const pendingVerifications = verifications.filter((v) => v.status === 'pending').length;
  const slowSellerCount = fulfilments.filter((g) => g.items.some((i) => i.slow)).length;
  const unresolvedPayments = payments.filter((p) => p.status === 'initialized' || p.status === 'initialize_failed').length;
  const openSupportTickets = supportTickets.filter((t) => t.status === 'open' || t.status === 'pending').length;
  const selectedSeller = sellerActivity.selected;
  const selectedSellerSummary = sellerActivity.sellers.find((s) => s.id === sellerActivityId) ?? null;
  const dangerAlerts = overview?.alerts.filter((alert) => alert.level === 'danger').length ?? 0;
  const warningAlerts = overview?.alerts.filter((alert) => alert.level === 'warn').length ?? 0;
  const refreshing =
    oLoading ||
    wLoading ||
    vLoading ||
    fLoading ||
    sLoading ||
    pLoading ||
    supportLoading ||
    evidenceLoading ||
    sellerActivityLoading ||
    pickupLoading;

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode; badge?: number; danger?: boolean }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} />, badge: dangerAlerts, danger: true },
    { id: 'money', label: 'Money', icon: <Wallet size={14} /> },
    { id: 'people', label: 'People', icon: <Users size={14} /> },
    { id: 'broadcasts', label: 'Broadcasts', icon: <Megaphone size={14} /> },
    { id: 'withdrawals', label: 'Payouts', icon: <Banknote size={14} />, badge: pendingCount },
    { id: 'verifications', label: 'Verifications', icon: <IdCard size={14} />, badge: pendingVerifications },
    { id: 'payments', label: 'Payments', icon: <CreditCard size={14} />, badge: unresolvedPayments },
    { id: 'support', label: 'Support', icon: <MessageCircle size={14} />, badge: openSupportTickets, danger: true },
    { id: 'seller_activity', label: 'Seller activity', icon: <Store size={14} /> },
    { id: 'pickup', label: 'Pickup logs', icon: <Truck size={14} />, badge: pickup.events.length },
    { id: 'fulfilment', label: 'Fulfilment', icon: <Package size={14} />, badge: slowSellerCount, danger: true },
    { id: 'storage', label: 'Storage', icon: <HardDrive size={14} /> },
  ];

  const activitySection = (title: string, count: number, empty: string, rows: React.ReactNode) => (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <h3 className="text-xs font-bold text-white">{title}</h3>
        <span className="font-mono text-[10px] text-neutral-500">{count}</span>
      </div>
      {count > 0 ? (
        <div className="divide-y divide-white/5">{rows}</div>
      ) : (
        <p className="px-4 py-6 text-center font-mono text-[11px] text-neutral-600">{empty}</p>
      )}
    </section>
  );

  return (
    <div className={`min-h-screen bg-[#070708] text-white px-4 py-6 sm:py-8 ${theme === 'light' ? 'admin-light' : ''}`}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.025] to-transparent p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#DE6437]/30 bg-[#DE6437]/10">
              <ShieldCheck size={22} className="text-[#FF9B73]" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">FuhsiMarket Ops</h1>
              <p className="text-[11px] font-mono text-neutral-400">
                Signups · orders · money · seller activity
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-mono text-neutral-400">
              <CalendarDays size={12} />
              <span>Date</span>
              <select
                value={range}
                onChange={(event) => setRange(event.target.value as AdminRange)}
                className="bg-transparent text-xs font-bold text-white outline-none [&>option]:bg-neutral-950"
                aria-label="Admin date range"
              >
                {ADMIN_RANGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {overview ? (
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-mono text-neutral-400 sm:inline-flex">
                Updated {new Date(overview.generatedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            <button
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch admin board to light mode' : 'Switch admin board to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-neutral-300 transition-colors hover:text-white"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-[#DE6437] px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#C9511F] disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {pendingCount > 0 ? (
            <button
              onClick={() => setTab('withdrawals')}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-mono text-amber-300"
            >
              {pendingCount} payout{pendingCount === 1 ? '' : 's'} waiting
            </button>
          ) : null}
          {pendingVerifications > 0 ? (
            <button
              onClick={() => setTab('verifications')}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-mono text-amber-300"
            >
              {pendingVerifications} verification{pendingVerifications === 1 ? '' : 's'} waiting
            </button>
          ) : null}
          {unresolvedPayments > 0 ? (
            <button
              onClick={() => setTab('payments')}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-mono text-amber-300"
            >
              {unresolvedPayments} payment{unresolvedPayments === 1 ? '' : 's'} waiting
            </button>
          ) : null}
          {slowSellerCount > 0 ? (
            <button
              onClick={() => setTab('fulfilment')}
              className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[10px] font-mono text-red-300"
            >
              {slowSellerCount} slow fulfilment item{slowSellerCount === 1 ? '' : 's'}
            </button>
          ) : null}
          {dangerAlerts > 0 ? (
            <button
              onClick={() => setTab('overview')}
              className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[10px] font-mono text-red-300"
            >
              {dangerAlerts} critical alert{dangerAlerts === 1 ? '' : 's'}
            </button>
          ) : null}
          {pendingCount === 0 && pendingVerifications === 0 && unresolvedPayments === 0 && slowSellerCount === 0 && dangerAlerts === 0 && warningAlerts === 0 ? (
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono text-emerald-300">
              All systems normal
            </span>
          ) : null}
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-mono transition-all ${
                tab === item.id
                  ? 'border-[#DE6437] bg-[#DE6437] text-white shadow-lg shadow-[#DE6437]/20'
                  : 'border-white/10 bg-white/[0.04] text-neutral-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {item.icon} {item.label}
              {item.badge && item.badge > 0 ? (
                <span
                  className={`rounded-full border px-1.5 text-[10px] ${
                    item.danger
                      ? 'border-red-400/30 bg-red-500/20 text-red-100'
                      : 'border-amber-400/30 bg-amber-500/20 text-amber-100'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'withdrawals' && wError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {wError}
          </p>
        )}
        {tab === 'withdrawals' && wMessage && (
          <p className="mb-4 rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-mono text-emerald-300">
            {wMessage}
          </p>
        )}
        {tab === 'payments' && pError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {pError}
          </p>
        )}
        {tab === 'support' && supportError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {supportError}
          </p>
        )}
        {tab === 'support' && evidenceError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {evidenceError}
          </p>
        )}
        {tab === 'seller_activity' && sellerActivityError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {sellerActivityError}
          </p>
        )}
        {tab === 'pickup' && pickupError && (
          <p className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">
            {pickupError}
          </p>
        )}

        {tab === 'overview' ? (
          <OverviewTab
            data={overview}
            loading={oLoading}
            error={oError}
            onRetry={loadOverview}
            onOpenTab={setTab}
          />
        ) : tab === 'money' ? (
          <MoneyTab
            data={overview}
            loading={oLoading}
            error={oError}
            onRetry={loadOverview}
          />
        ) : tab === 'people' ? (
          <PeopleTab
            onOpenTab={setTab}
            refreshToken={refreshToken}
            range={range}
            onReviewSeller={openSellerReview}
          />
        ) : tab === 'broadcasts' ? (
          <BroadcastsTab refreshToken={refreshToken} />
        ) : tab === 'payments' ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[11px] leading-relaxed text-amber-200">
              <strong>Buyer paid but no order appeared?</strong> First use{' '}
              <span className="font-mono">Re-check Paystack</span> — it only records a transaction Paystack confirms with a matching reference, buyer, currency and amount. Use{' '}
              <span className="font-mono">Confirm manually</span> only after you verified the bank transfer receipt yourself; the evidence note and your attestation are saved in the audit trail. Both actions are idempotent and cannot create a second order.
            </div>
            {pLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-neutral-600" size={24} />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-center text-xs text-neutral-500 py-16 font-mono">No checkout attempts recorded yet.</p>
            ) : (
              payments.map((p) => {
                const confirmed = p.status === 'confirmed_paystack' || p.status === 'confirmed_manual';
                const isManualTarget = manualTarget?.reference === p.reference;
                return (
                  <div
                    key={p.reference}
                    className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base">₦{formatNaira(p.expected_total_kobo)}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${PAYMENT_STATUS_STYLE[p.status] || PAYMENT_STATUS_STYLE.initialized}`}>
                            {p.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-neutral-500 break-all">{p.reference}</p>
                        <p className="text-[11px] text-neutral-400">
                          {p.buyer_email || p.buyer_id} · {p.item_count} product line{p.item_count === 1 ? '' : 's'}
                        </p>
                        {Number(p.wallet_kobo) > 0 ? (
                          <p className="text-[10px] font-mono text-sky-400/80">
                            Wallet portion ₦{formatNaira(p.wallet_kobo)} will be debited once by the existing wallet ledger.
                          </p>
                        ) : null}
                        <p className="text-[10px] font-mono text-neutral-600">
                          started {new Date(p.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!confirmed ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => recheckPayment(p.reference)}
                            disabled={actingPayment === p.reference}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {actingPayment === p.reference ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                            Re-check Paystack
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setManualTarget(p);
                              setManualNote('');
                              setManualAttested(false);
                            }}
                            disabled={actingPayment === p.reference}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                          >
                            <ShieldCheck size={13} /> Confirm manually
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {p.paystack_checked_at ? (
                      <p className="text-[10px] font-mono text-neutral-500">
                        Paystack checked {new Date(p.paystack_checked_at).toLocaleString()}
                      </p>
                    ) : null}
                    {confirmed ? (
                      <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-[10px] font-mono text-emerald-300 space-y-1">
                        <p>Confirmed {p.confirmed_at ? new Date(p.confirmed_at).toLocaleString() : ''}</p>
                        {p.confirmation_note ? <p className="text-neutral-400 break-words">Evidence: {p.confirmation_note}</p> : null}
                      </div>
                    ) : null}

                    {isManualTarget && !confirmed ? (
                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 space-y-2">
                        <p className="text-[11px] leading-relaxed text-amber-200">
                          Confirming this will create the buyer&apos;s order and escrow rows from the frozen checkout snapshot. Only continue when you have checked the exact transfer and bank account yourself.
                        </p>
                        <textarea
                          value={manualNote}
                          onChange={(event) => setManualNote(event.target.value)}
                          placeholder="Evidence note: bank, account, amount, date, reference shown by the buyer…"
                          rows={3}
                          className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-amber-500"
                        />
                        <label className="flex items-start gap-2 text-[10px] leading-relaxed text-neutral-400">
                          <input
                            type="checkbox"
                            checked={manualAttested}
                            onChange={(event) => setManualAttested(event.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          />
                          <span>I verified this exact bank transfer and accept that the evidence note is stored in the audit trail.</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={confirmPaymentManually}
                            disabled={actingPayment === p.reference}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {actingPayment === p.reference ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Confirm payment
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setManualTarget(null);
                              setManualNote('');
                              setManualAttested(false);
                            }}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-neutral-300 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : tab === 'support' ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.035]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <Mail size={14} className="text-[#FF9B73]" />
                <h2 className="text-sm font-bold text-white">Support tickets</h2>
                <span className="ml-auto font-mono text-[10px] text-neutral-500">
                  {supportTickets.length} in range · {openSupportTickets} open/pending
                </span>
              </div>
              {supportLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-neutral-600" size={22} />
                </div>
              ) : supportTickets.length === 0 ? (
                <p className="px-4 py-12 text-center font-mono text-[11px] text-neutral-500">
                  No support tickets in this date range.
                </p>
              ) : (
                <div className="divide-y divide-white/5">
                  {supportTickets.slice(0, 50).map((ticket) => (
                    <div key={ticket.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-white">{ticket.subject}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${SUPPORT_STATUS_STYLE[ticket.status] || SUPPORT_STATUS_STYLE.open}`}
                        >
                          {ticket.status}
                        </span>
                        {ticket.category ? (
                          <span className="font-mono text-[10px] text-neutral-500">{ticket.category}</span>
                        ) : null}
                      </div>
                      <p className="font-mono text-[10px] text-neutral-500">
                        {ticket.user_name || 'Unknown requester'} · {ticket.user_email || ticket.user_id} ·{' '}
                        {formatDateTime(ticket.created_at)} · {ticket.message_count} message
                        {ticket.message_count === 1 ? '' : 's'}
                      </p>
                      <p className="break-words text-[11px] leading-relaxed text-neutral-400">
                        {ticket.last_message || ticket.message}
                        {ticket.last_message_at ? ` · ${formatDateTime(ticket.last_message_at)}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTicket(replyingTicket === ticket.id ? null : ticket.id);
                            setReplyDrafts((drafts) => ({ ...drafts, [ticket.id]: drafts[ticket.id] || '' }));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500/20"
                        >
                          <Mail size={11} /> Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => void actOnSupportTicket(ticket.id, 'resolve')}
                          disabled={actingTicket === ticket.id || ticket.status === 'resolved'}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {actingTicket === ticket.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => void actOnSupportTicket(ticket.id, 'close')}
                          disabled={actingTicket === ticket.id || ticket.status === 'closed'}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                        >
                          <X size={11} /> Close
                        </button>
                      </div>
                      {replyingTicket === ticket.id ? (
                        <div className="space-y-2 rounded-xl border border-white/10 bg-neutral-950/70 p-3">
                          <textarea
                            value={replyDrafts[ticket.id] || ''}
                            onChange={(event) =>
                              setReplyDrafts((drafts) => ({ ...drafts, [ticket.id]: event.target.value }))
                            }
                            rows={3}
                            maxLength={2000}
                            placeholder="Write a clear reply to the requester…"
                            className="w-full resize-none rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-sky-500"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void actOnSupportTicket(ticket.id, 'reply')}
                              disabled={actingTicket === ticket.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                            >
                              {actingTicket === ticket.id ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />}
                              Send reply
                            </button>
                            <button
                              type="button"
                              onClick={() => setReplyingTicket(null)}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-neutral-300 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.035]">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <Receipt size={14} className="text-[#FF9B73]" />
                <h2 className="text-sm font-bold text-white">Payment evidence</h2>
                <span className="ml-auto font-mono text-[10px] text-neutral-500">
                  {evidence.length} submission{evidence.length === 1 ? '' : 's'}
                </span>
              </div>
              {evidenceLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-neutral-600" size={22} />
                </div>
              ) : evidence.length === 0 ? (
                <p className="px-4 py-12 text-center font-mono text-[11px] text-neutral-500">
                  No payment evidence submissions in this date range.
                </p>
              ) : (
                <div className="space-y-3 p-3">
                  {evidence.slice(0, 50).map((item) => {
                    const draft: { status: 'under_review' | 'resolved' | 'rejected'; adminNote: string } =
                      evidenceDrafts[item.id] || { status: 'under_review', adminNote: '' };
                    const proofSrc = safeImageSrc(item.proof_url || item.proof_path);
                    return (
                      <div key={item.id} className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {item.buyer_name || 'Unknown buyer'}
                          </span>
                          <span className="font-bold text-emerald-400">{fullNaira(item.expected_total_kobo)}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${EVIDENCE_STATUS_STYLE[item.status] || EVIDENCE_STATUS_STYLE.pending}`}
                          >
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="break-all font-mono text-[10px] text-neutral-500">
                          Checkout {item.checkout_reference} · Buyer ref {item.buyer_reference} ·{' '}
                          {item.buyer_email || item.buyer_id} · paid{' '}
                          {item.paid_at ? formatDateTime(item.paid_at) : '—'}
                        </p>
                        {item.checkout_status ? (
                          <p className="font-mono text-[10px] text-neutral-600">
                            Checkout status: {item.checkout_status} · submitted {formatDateTime(item.created_at)}
                          </p>
                        ) : null}
                        {item.note ? (
                          <p className="rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2 text-[11px] leading-relaxed text-neutral-300">
                            Buyer note: {item.note}
                          </p>
                        ) : null}
                        <div className="flex items-center gap-3">
                          {proofSrc ? (
                            <a
                              href={proofSrc}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-bold text-neutral-300 hover:text-white"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={proofSrc}
                                alt="Payment proof thumbnail"
                                className="h-10 w-10 rounded-md border border-white/10 object-cover"
                              />
                              Open proof
                            </a>
                          ) : (
                            <span className="font-mono text-[10px] text-neutral-600">No safe proof URL</span>
                          )}
                          {item.admin_note ? (
                            <span className="font-mono text-[10px] text-neutral-500">
                              Last review: {item.admin_note}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex flex-col gap-1 font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                            Status
                            <select
                              value={draft.status}
                              onChange={(event) =>
                                setEvidenceDrafts((drafts) => ({
                                  ...drafts,
                                  [item.id]: {
                                    ...(drafts[item.id] || { status: 'under_review', adminNote: '' }),
                                    status: event.target.value as 'under_review' | 'resolved' | 'rejected',
                                  },
                                }))
                              }
                              className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5 text-[11px] text-neutral-200 outline-none"
                            >
                              <option value="under_review">Under review</option>
                              <option value="resolved">Resolved</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </label>
                          <label className="min-w-[12rem] flex-1 font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                            Review note
                            <textarea
                              value={draft.adminNote}
                              onChange={(event) =>
                                setEvidenceDrafts((drafts) => ({
                                  ...drafts,
                                  [item.id]: {
                                    ...(drafts[item.id] || { status: 'under_review', adminNote: '' }),
                                    adminNote: event.target.value,
                                  },
                                }))
                              }
                              rows={2}
                              maxLength={500}
                              placeholder="What you checked and decided…"
                              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-[11px] normal-case tracking-normal text-neutral-100 outline-none focus:border-[#DE6437]"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void saveEvidenceReview(item)}
                            disabled={actingEvidence === item.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DE6437] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#C9511F] disabled:opacity-50"
                          >
                            {actingEvidence === item.id ? <Loader2 size={11} className="animate-spin" /> : <ClipboardList size={11} />}
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : tab === 'seller_activity' ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <label className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-neutral-400">
                Seller
                <select
                  value={sellerActivityId || ''}
                  onChange={(event) => {
                    const nextId = event.target.value || null;
                    setSellerActivityId(nextId);
                    void loadSellerActivity(nextId);
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-[#DE6437] sm:max-w-sm"
                >
                  <option value="">Select a seller…</option>
                  {sellerActivity.sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.name}
                    </option>
                  ))}
                </select>
                {sellerActivityLoading ? <Loader2 size={13} className="animate-spin text-neutral-500" /> : null}
              </label>
              {selectedSeller ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <span className="text-xs font-bold text-white">{selectedSeller.seller.name}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${
                      selectedSeller.seller.isSuspended
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : selectedSeller.seller.isApprovedSeller
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {selectedSeller.seller.isSuspended
                      ? 'suspended'
                      : selectedSeller.seller.verificationStatus || 'unverified'}
                  </span>
                  {selectedSeller.seller.isPickupStaff ? (
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-300">
                      pickup staff
                    </span>
                  ) : null}
                  <span className="font-mono text-[10px] text-neutral-500">
                    Products {selectedSellerSummary?.productCount ?? selectedSeller.products.length} · Orders{' '}
                    {selectedSellerSummary?.orderCount ?? selectedSeller.orders.length} · Disputes{' '}
                    {selectedSellerSummary?.disputeCount ?? 0} · Complaints{' '}
                    {selectedSellerSummary?.complaintCount ?? selectedSeller.complaints.length} · Payment issues{' '}
                    {selectedSellerSummary?.paymentIssueCount ?? selectedSeller.paymentIssues.length} · Moderation{' '}
                    {selectedSellerSummary?.moderationCount ?? selectedSeller.moderation.length} · Last activity{' '}
                    {selectedSellerSummary?.lastActivityAt
                      ? formatDateTime(selectedSellerSummary.lastActivityAt)
                      : '—'}
                  </span>
                  {selectedSeller.seller.suspensionReason ? (
                    <span className="w-full font-mono text-[10px] text-red-300">
                      Suspension reason: {selectedSeller.seller.suspensionReason}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 border-t border-white/10 pt-3 font-mono text-[11px] text-neutral-500">
                  Choose a seller from the directory or the selector above to inspect their activity.
                </p>
              )}
            </section>

            {selectedSeller ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {activitySection(
                  'Products',
                  selectedSeller.products.length,
                  'No products listed for this seller.',
                  selectedSeller.products.slice(0, 50).map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-neutral-100">{product.title}</p>
                        <p className="font-mono text-[9px] text-neutral-600">
                          {formatDateTime(product.createdAt)} · stock {product.stock}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-emerald-400">
                        {fullNaira(product.priceKobo)}
                      </span>
                    </div>
                  )),
                )}
                {activitySection(
                  'Orders',
                  selectedSeller.orders.length,
                  'No orders recorded for this seller.',
                  selectedSeller.orders.slice(0, 50).map((order) => (
                    <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] font-bold text-neutral-100">{order.ref}</p>
                        <p className="font-mono text-[9px] text-neutral-600">
                          {order.buyerName} · {order.status} · {formatDateTime(order.createdAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-emerald-400">
                        {fullNaira(order.amountKobo)}
                      </span>
                    </div>
                  )),
                )}
                {activitySection(
                  'Complaints',
                  selectedSeller.complaints.length,
                  'No complaints recorded for this seller.',
                  selectedSeller.complaints.slice(0, 50).map((complaint) => (
                    <div key={complaint.id} className="space-y-0.5 px-4 py-2.5">
                      <p className="text-[11px] font-semibold text-neutral-100">
                        {complaint.label}
                        {complaint.rating !== null ? (
                          <span className="ml-2 font-mono text-[9px] text-amber-300">{complaint.rating}★</span>
                        ) : null}
                      </p>
                      <p className="font-mono text-[9px] text-neutral-600">
                        {complaint.source} · {formatDateTime(complaint.createdAt)}
                      </p>
                      {complaint.snippet ? (
                        <p className="text-[10px] leading-relaxed text-neutral-400">{complaint.snippet}</p>
                      ) : null}
                    </div>
                  )),
                )}
                {activitySection(
                  'Payment issues',
                  selectedSeller.paymentIssues.length,
                  'No payment issues recorded for this seller.',
                  selectedSeller.paymentIssues.slice(0, 50).map((issue) => (
                    <div key={issue.reference} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] font-bold text-neutral-100">{issue.reference}</p>
                        <p className="font-mono text-[9px] text-neutral-600">
                          {issue.buyerEmail || 'Unknown buyer'} · {issue.status} ·{' '}
                          {formatDateTime(issue.createdAt)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-emerald-400">
                        {fullNaira(issue.expectedTotalKobo)}
                      </span>
                    </div>
                  )),
                )}
                {activitySection(
                  'Moderation history',
                  selectedSeller.moderation.length,
                  'No moderation actions recorded for this seller.',
                  selectedSeller.moderation.slice(0, 50).map((entry) => (
                    <div key={entry.id} className="px-4 py-2.5">
                      <p className="font-mono text-[10px] font-bold uppercase text-neutral-200">{entry.action}</p>
                      <p className="text-[10px] leading-relaxed text-neutral-400">{entry.reason || 'No reason recorded'}</p>
                      <p className="font-mono text-[9px] text-neutral-600">
                        {entry.adminName || 'Admin'} · {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                  )),
                )}
                {activitySection(
                  'Internal review notes',
                  selectedSeller.reviewNotes.length,
                  'No internal review notes for this seller.',
                  selectedSeller.reviewNotes.slice(0, 50).map((note) => (
                    <div key={note.id} className="px-4 py-2.5">
                      <p className="text-[10px] leading-relaxed text-neutral-300">{note.note}</p>
                      <p className="font-mono text-[9px] text-neutral-600">
                        {note.adminName || 'Admin'} · {formatDateTime(note.createdAt)}
                      </p>
                    </div>
                  )),
                )}
              </div>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-10 text-center font-mono text-[11px] text-neutral-500">
                No seller selected.
              </p>
            )}
          </div>
        ) : tab === 'pickup' ? (
          <div className="space-y-4">
            {pickupLoading ? (
              <div className="flex justify-center py-14">
                <Loader2 className="animate-spin text-neutral-600" size={22} />
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-white/10 bg-white/[0.035]">
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <Truck size={14} className="text-sky-300" />
                    <h2 className="text-sm font-bold text-white">Pickup staff</h2>
                    <span className="ml-auto font-mono text-[10px] text-neutral-500">
                      {pickup.staff.filter((member) => member.isPickupStaff).length} assigned
                    </span>
                  </div>
                  {pickup.staff.length === 0 ? (
                    <p className="px-4 py-6 text-center font-mono text-[11px] text-neutral-600">
                      No staff accounts found.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {pickup.staff.slice(0, 100).map((member) => (
                        <div key={member.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="truncate text-[11px] font-semibold text-neutral-100">{member.name}</span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                              member.isPickupStaff
                                ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                                : 'border-white/10 bg-white/5 text-neutral-500'
                            }`}
                          >
                            {member.isPickupStaff ? 'pickup staff' : 'not assigned'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {activitySection(
                  'Staff role changes',
                  pickup.staffChanges.length,
                  'No pickup staff changes in this date range.',
                  pickup.staffChanges.slice(0, 50).map((change) => (
                    <div key={change.id} className="px-4 py-2.5">
                      <p className="text-[11px] font-semibold text-neutral-100">
                        {change.userName} · {change.action.replace(/_/g, ' ')}
                      </p>
                      {change.reason ? (
                        <p className="text-[10px] leading-relaxed text-neutral-400">{change.reason}</p>
                      ) : null}
                      <p className="font-mono text-[9px] text-neutral-600">
                        {change.adminName || 'Admin'} · {formatDateTime(change.createdAt)}
                      </p>
                    </div>
                  )),
                )}

                <section className="rounded-2xl border border-white/10 bg-white/[0.035]">
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                    <ClipboardList size={14} className="text-[#FF9B73]" />
                    <h2 className="text-sm font-bold text-white">Pickup events</h2>
                    <span className="ml-auto font-mono text-[10px] text-neutral-500">
                      {pickup.events.length} in range
                    </span>
                  </div>
                  {pickup.events.length === 0 ? (
                    <p className="px-4 py-6 text-center font-mono text-[11px] text-neutral-600">
                      No pickup events in this date range.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {pickup.events.slice(0, 100).map((event) => (
                        <div key={event.id} className="space-y-1 px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-neutral-100">{event.staffName}</span>
                            <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-sky-300">
                              {event.eventType.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono text-[9px] text-neutral-600">
                              {formatDateTime(event.createdAt)}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-neutral-400">
                            Order {event.orderRef} · Code{' '}
                            <span className="font-bold tracking-widest text-white">{event.deliveryCode}</span>
                          </p>
                          {event.note ? (
                            <p className="text-[10px] leading-relaxed text-neutral-400">{event.note}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        ) : tab === 'withdrawals' ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 text-[11px] leading-relaxed text-blue-200">
            <strong>Paystack Transfers must be enabled on a verified business account.</strong>{' '}
            Starter Business accounts cannot initiate third-party payouts. If Paystack blocks an attempt before creating a transfer, this board records <span className="font-mono">not-started</span> so Reject can safely return the held money. An <span className="font-mono">unknown</span> transfer must still be checked in Paystack before funds are returned, preventing a seller from being paid twice.
          </div>
          {wLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">No withdrawal requests yet.</p>
          ) : (
            withdrawals.map((w) => (
              <div
                key={w.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">₦{formatNaira(w.amount_kobo)}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${STATUS_STYLE[w.status]}`}
                    >
                      {w.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {w.account_name} · {w.bank_name} · {w.account_number}
                  </p>
                  {Number(w.transfer_fee_kobo) > 0 ? (
                    <p className="mt-0.5 text-[10px] font-mono text-neutral-500">
                      Platform-paid transfer/stamp cost: ₦{formatNaira(Number(w.transfer_fee_kobo))} · wallet debit ₦{formatNaira(Number(w.wallet_debit_kobo) || w.amount_kobo)}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                    {w.seller?.full_name || 'Seller'}
                  </p>
                  <p className="text-[10px] text-neutral-600 font-mono mt-0.5">
                    requested {new Date(w.created_at).toLocaleString()}
                  </p>
                  {w.transfer_status && w.status === 'pending' && (
                    <p className="text-[10px] text-blue-300 font-mono mt-1">
                      Paystack: {w.transfer_status}
                      {w.transfer_reference ? ` · ${w.transfer_reference}` : ''}
                    </p>
                  )}
                  {w.transfer_error && w.status === 'pending' ? (
                    <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-red-300">
                      {w.transfer_error}
                    </p>
                  ) : null}
                </div>
                {w.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => act('approve', w.id)}
                      disabled={actingId === w.id}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      {actingId === w.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                      Approve
                    </button>
                    <button
                      onClick={() => act('reject', w.id)}
                      disabled={actingId === w.id}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      <X size={13} /> Reject
                    </button>
                    {w.transfer_reference && ['unknown', 'error'].includes(w.transfer_status || '') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReconcileWithdrawal(w);
                          setReconcileNote('');
                          setReconcileChecked(false);
                        }}
                        disabled={actingId === w.id}
                        className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <ShieldCheck size={13} /> I checked Paystack
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'storage' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <ArrowDownLeft size={14} className="text-emerald-500" />
            <span className="text-[11px] font-mono text-neutral-400">
              Set each seller&apos;s storage quota in MB (blank = unlimited). Default is 8MB.
            </span>
          </div>
          {sMessage && (
            <p className="text-[11px] font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-900/50 rounded-xl px-3 py-2">
              {sMessage}
            </p>
          )}
          {sLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : sellers.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">No seller accounts yet.</p>
          ) : (
            sellers.map((s) => (
              <div
                key={s.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{s.full_name || 'Unnamed seller'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[s.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    placeholder="unlimited"
                    inputMode="numeric"
                    className="w-24 bg-neutral-900 border border-neutral-800 focus:border-red-600 text-sm rounded-xl px-3 py-2 text-center font-mono outline-none"
                  />
                  <span className="text-[10px] text-neutral-500 font-mono">MB</span>
                  <button
                    onClick={() => saveQuota(s.id)}
                    disabled={savingQuota === s.id}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingQuota === s.id ? <Loader2 className="animate-spin" size={13} /> : <ArrowUpRight size={13} />}
                    Save
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'fulfilment' ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['all', 'All orders', fulfilments.length],
                ['successful', 'Successful', orderFilterCount('successful')],
                ['pending', 'Pending', orderFilterCount('pending')],
                ['disputed', 'Disputed', orderFilterCount('disputed')],
              ] as const).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOrderFilter(id)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${
                    orderFilter === id
                      ? id === 'disputed'
                        ? 'border-red-500 bg-red-600 text-white'
                        : 'border-[#DE6437] bg-[#DE6437] text-white'
                      : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  {label} · {count}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
              Seller
              <select
                value={sellerFilter}
                onChange={(event) => setSellerFilter(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-[#DE6437] sm:max-w-xs"
              >
                <option value="all">All sellers</option>
                {fulfilmentSellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>{seller.name}</option>
                ))}
              </select>
            </label>
          </div>
          {fError && (
            <p className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5 mb-2">
              {fError}
            </p>
          )}
          {fLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : filteredFulfilments.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">No orders match these filters.</p>
          ) : (
            filteredFulfilments.map((g) => (
              <div key={g.order_ref} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black font-mono tracking-widest text-white">{g.delivery_code}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                          g.groupStatus === 'ready_for_pickup'
                            ? 'bg-sky-950/60 text-sky-300 border-sky-800'
                            : g.groupStatus === 'completed' || g.groupStatus === 'confirmed' || g.groupStatus === 'delivered'
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                            : g.groupStatus === 'disputed' || g.groupStatus === 'cancelled'
                            ? 'bg-red-950/60 text-red-300 border-red-800'
                            : 'bg-amber-950/60 text-amber-300 border-amber-800'
                        }`}
                      >
                        {g.groupStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-600 font-mono mt-1">
                      Seller: <span className="text-neutral-300">{g.sellerName}</span> · Buyer:{' '}
                      <span className="text-neutral-300">{g.buyer.name}</span> · {g.items.length} product line
                      {g.items.length === 1 ? '' : 's'} · {new Date(g.createdAt).toLocaleString()}
                    </p>
                    {g.deliveryFeeKobo > 0 && (
                      <p className="text-[9px] font-mono text-sky-400/80 mt-0.5">
                        Delivery ₦{formatNaira(g.deliveryFeeKobo)} is charged once for the whole order and is shown on every seller group.
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-mono font-bold text-sm">
                      ₦{formatNaira(g.items.reduce((sum, item) => sum + item.amountKobo, 0))}
                    </p>
                    <p className="text-[9px] font-mono text-neutral-500">Goods for this seller</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {g.items.map((i) => (
                    <div
                      key={i.orderId}
                      className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                        i.slow
                          ? 'bg-red-950/20 border-red-900/50'
                          : 'bg-neutral-900/60 border-neutral-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-neutral-100 truncate">
                            {i.product?.title || 'Campus asset purchase'}
                          </span>
                          {i.quantity > 1 && (
                            <span className="text-[9px] font-mono text-red-400 bg-red-950/40 border border-red-900/60 rounded px-1">
                              x{i.quantity}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-neutral-500 font-mono truncate">
                          {variantLabel(i.size, i.color) ? `${variantLabel(i.size, i.color)} · ` : ''}
                          ₦{formatNaira(i.amountKobo)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                            i.status === 'ready_for_pickup'
                              ? 'bg-sky-950/60 text-sky-300 border-sky-800'
                              : i.status === 'completed' || i.status === 'confirmed' || i.status === 'delivered'
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                              : i.status === 'disputed' || i.status === 'cancelled'
                              ? 'bg-red-950/60 text-red-300 border-red-800'
                              : 'bg-amber-950/60 text-amber-300 border-amber-800'
                          }`}
                        >
                          {i.status.replace(/_/g, ' ')}
                        </span>
                        {i.statusChangedAt && (
                          <p className="text-[9px] font-mono text-neutral-500 mt-1">
                            <Clock size={9} className="inline -mt-0.5" /> {elapsedLabel(i.statusChangedAt)}
                          </p>
                        )}
                        {i.status === 'disputed' && i.returnRequired ? (
                          i.returnReceivedAt ? (
                            <p className="mt-1 text-[9px] font-mono text-emerald-400">
                              return confirmed · {i.returnConfirmationSource || 'seller'}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReturnOverride(i);
                                setReturnOverrideReason('');
                              }}
                              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[9px] font-bold text-red-300 hover:bg-red-500/20"
                            >
                              <RotateCcw size={10} /> Confirm return evidence
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {g.items.some((i) => i.slow) && (
                  <p className="text-[10px] font-mono text-red-400 flex items-center gap-1.5 border-t border-red-900/40 pt-2">
                    <TriangleAlert size={12} /> Some sellers are delaying the combined order.
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'verifications' ? (
        <div className="space-y-3">
          {vError && (
            <p className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5 mb-2">
              {vError}
            </p>
          )}
          {vLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-neutral-600" size={24} />
            </div>
          ) : verifications.length === 0 ? (
            <p className="text-center text-xs text-neutral-500 py-16 font-mono">
              No seller verification submissions yet.
            </p>
          ) : (
            verifications.map((v) => (
              <div
                key={v.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{v.full_name || 'Unnamed seller'}</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                      v.status === 'pending'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                        : v.isApproved
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        : 'bg-red-950/60 text-red-300 border-red-800'
                    }`}
                  >
                    {v.isApproved ? 'approved' : v.status || '—'}
                  </span>
                </div>
                {v.submittedAt && (
                  <p className="text-[10px] text-neutral-600 font-mono">
                    submitted {new Date(v.submittedAt).toLocaleString()}
                  </p>
                )}
                {v.consentAt ? (
                  <p className="text-[10px] text-emerald-400/80 font-mono">
                    consent recorded {new Date(v.consentAt).toLocaleString()} · {v.consentVersion || 'version unavailable'}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {v.urls.student_id_url ? (
                    <a
                      href={v.urls.student_id_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-2 rounded-xl transition-all"
                    >
                      <IdCard size={13} /> View Student ID
                    </a>
                  ) : (
                    <span className="text-[11px] text-neutral-600 font-mono">No ID uploaded</span>
                  )}
                  {v.urls.verification_video_url ? (
                    <a
                      href={v.urls.verification_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-2 rounded-xl transition-all"
                    >
                      <Video size={13} /> View Video
                    </a>
                  ) : (
                    <span className="text-[11px] text-neutral-600 font-mono">No video uploaded</span>
                  )}
                </div>

                {v.status === 'rejected' && v.rejectReason && (
                  <p className="text-[11px] text-neutral-400 border-l-2 border-red-700 pl-3">
                    Rejected: “{v.rejectReason}”
                  </p>
                )}

                {!v.isApproved && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] text-neutral-400">
                        Rejection reason (required to reject)
                      </label>
                      <input
                        value={rejectReasons[v.id] ?? ''}
                        onChange={(e) => setRejectReasons((r) => ({ ...r, [v.id]: e.target.value }))}
                        placeholder="e.g. ID could not be verified"
                        className="w-full bg-neutral-900 border border-neutral-800 focus:border-red-600 text-sm rounded-xl px-3 py-2 outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => actVerification('approve', v.id)}
                        disabled={actingV === v.id}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      >
                        {actingV === v.id ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                        <span className="inline-flex items-center gap-1">
                          <Eye size={13} /> Approve
                        </span>
                      </button>
                      <button
                        onClick={() => actVerification('reject', v.id)}
                        disabled={actingV === v.id}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                      >
                        <X size={13} /> Reject submission
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
      {returnOverride ? (
        <div className="fixed inset-0 z-[115] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-300">
                <RotateCcw size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-white">Confirm return as administrator</h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  Use this only after checking handover evidence or contacting both parties. It replaces the seller’s confirmation and allows the buyer refund to continue.
                </p>
              </div>
            </div>
            {returnOverride.disputeReason ? (
              <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200">
                Buyer report: “{returnOverride.disputeReason}”
              </p>
            ) : null}
            <label className="mt-4 block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              Evidence checked / reason for override
              <textarea
                value={returnOverrideReason}
                onChange={(event) => setReturnOverrideReason(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="e.g. Seller confirmed the physical return by support call and handover photo"
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none focus:border-red-500"
              />
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReturnOverride(null)}
                disabled={savingReturnOverride}
                className="rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-neutral-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReturnAsAdmin()}
                disabled={savingReturnOverride}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {savingReturnOverride ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {savingReturnOverride ? 'Saving…' : 'Confirm override'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {reconcileWithdrawal ? (
        <div className="fixed inset-0 z-[116] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/20 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-300">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-base font-black text-white">Reconcile an unknown transfer</h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  This does not move money. Use it only after the Paystack Transfers dashboard shows that this exact reference was never created. You will then use Reject separately to return the held wallet amount.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] text-neutral-300">
              Reference: <span className="font-bold text-amber-300">{reconcileWithdrawal.transfer_reference}</span>
            </div>
            <label className="mt-4 block text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              What you checked
              <textarea
                value={reconcileNote}
                onChange={(event) => setReconcileNote(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. Searched Transfers by the full reference at 14:30; Paystack returned no record"
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none focus:border-amber-500"
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[11px] leading-relaxed text-amber-100">
              <input
                type="checkbox"
                checked={reconcileChecked}
                onChange={(event) => setReconcileChecked(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
              />
              I checked this exact reference in Paystack and confirmed that no transfer exists and no bank payment can still arrive.
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReconcileWithdrawal(null)}
                disabled={savingReconciliation}
                className="rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-neutral-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveReconciliation()}
                disabled={savingReconciliation || !reconcileChecked}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {savingReconciliation ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {savingReconciliation ? 'Recording…' : 'Record no transfer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

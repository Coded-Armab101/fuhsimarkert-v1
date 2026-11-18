'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import PushNotificationToggle from '@/components/PushNotificationToggle';

type Notice = {
  id: string;
  type: string;
  title: string;
  message: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

type SubscriptionInfo = {
  expiresAt: string | null;
  daysLeft: number | null;
  bucket: 'active' | 'expiring' | 'expired' | 'none';
};

type Props = { role: 'buyer' | 'seller'; className?: string };

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(value).toLocaleDateString();
}

export default function OrderNotificationBell({ role, className = '' }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subscriptionSeen, setSubscriptionSeen] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const lastSubscriptionCheckRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const storageKey = `fuhsi_order_notifications_${role}`;
  const subscriptionKey = `${storageKey}_subscription_seen`;
  const defaultUrl = role === 'seller' ? '/seller/orders' : '/buyer/orders';

  const load = useCallback(async () => {
    if (document.visibilityState !== 'visible' || loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      if (!userIdRef.current) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userIdRef.current = user.id;
      }
      const userId = userIdRef.current;
      if (!userId) return;

      // Seller plan reminders ride the same bell. Checked at most every 15 min;
      // `bucket` only changes when the plan crosses the 7-day/expired line so
      // the reminder does not nag on every poll.
      if (role === 'seller' && Date.now() - lastSubscriptionCheckRef.current > 15 * 60 * 1000) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_expires_at')
          .eq('id', userId)
          .maybeSingle();
        lastSubscriptionCheckRef.current = Date.now();
        const expiresAt = (profile?.subscription_expires_at as string | null) ?? null;
        let daysLeft: number | null = null;
        let bucket: SubscriptionInfo['bucket'] = 'none';
        if (expiresAt) {
          const diffMs = new Date(expiresAt).getTime() - Date.now();
          daysLeft = Math.ceil(diffMs / 86400000);
          bucket = diffMs < 0 ? 'expired' : daysLeft <= 7 ? 'expiring' : 'active';
        }
        setSubscription({ expiresAt, daysLeft, bucket });
        setSubscriptionSeen(localStorage.getItem(subscriptionKey) === `${expiresAt ?? 'none'}:${bucket}`);
      } else if (role !== 'seller') {
        setSubscription(null);
      }

      // The real inbox: notifications are written by trusted server code for
      // BOTH buyers and sellers, and unread state lives in the database so an
      // alert received while the tab was closed is still unread on return.
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, url, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) {
        console.warn('[notifications] could not load inbox', error.message);
        return;
      }
      setNotices((data as Notice[] | null) ?? []);
    } finally {
      loadInFlightRef.current = false;
    }
  }, [role, subscriptionKey, supabase]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const onMarked = () => void load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('fuhsi-notifications-read', onMarked);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('fuhsi-notifications-read', onMarked);
    };
  }, [load]);

  const unreadCount = useMemo(() => notices.filter((n) => !n.read_at).length, [notices]);

  const subscriptionNeedsAttention =
    role === 'seller' &&
    subscription !== null &&
    (subscription.bucket === 'expiring' || subscription.bucket === 'expired');
  const showSubscriptionNotice = subscriptionNeedsAttention && !subscriptionSeen;
  const badgeCount = unreadCount + (showSubscriptionNotice ? 1 : 0);

  const dismissSubscription = () => {
    if (!subscription) return;
    localStorage.setItem(subscriptionKey, `${subscription.expiresAt ?? 'none'}:${subscription.bucket}`);
    setSubscriptionSeen(true);
  };

  const subscriptionText = subscription
    ? subscription.bucket === 'expired'
      ? 'Your seller plan has expired. Renew to keep selling.'
      : subscription.bucket === 'expiring'
        ? `Your seller plan expires in ${Math.max(0, subscription.daysLeft ?? 0)} day${Math.max(0, subscription.daysLeft ?? 0) === 1 ? '' : 's'}. Renew to avoid a gap.`
        : 'Your seller plan is active.'
    : '';

  const openNotifications = () => setOpen((v) => !v);

  const markRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      const response = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const now = new Date().toISOString();
        setNotices((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
        // Keep the bottom-nav badge on other pages in sync immediately.
        window.dispatchEvent(new Event('fuhsi-notifications-read'));
      }
      if (showSubscriptionNotice) dismissSubscription();
    } catch (err) {
      console.warn('[notifications] could not mark read', err);
    } finally {
      setMarking(false);
    }
  };

  const openNotice = (notice: Notice) => {
    setOpen(false);
    const path = notice.url || defaultUrl;
    if (path.startsWith('/') && !path.startsWith('//')) router.push(path);
  };

  return (
    <div className={`relative ${className}`}>
      <button onClick={openNotifications} aria-label={role === 'seller' ? 'Seller sales notifications' : 'Buyer order notifications'} className="relative grid h-10 w-10 place-items-center rounded-full bg-white/80 text-[#2e2520] shadow-sm border border-[#eee4dc]">
        <Bell size={18} />
        {badgeCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ef6b3b] px-1 text-[9px] font-black text-white">{badgeCount > 9 ? '9+' : badgeCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[80] w-[min(90vw,340px)] overflow-hidden rounded-2xl border border-[#eee4dc] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#f0e9e2] px-4 py-3">
            <div><p className="text-sm font-black text-[#251d18]">Notifications</p><p className="text-[10px] text-[#81756d]">{role === 'seller' ? 'Sales and payout updates' : 'Your order updates'}</p></div>
            {unreadCount > 0 && (
              <button onClick={() => void markRead()} disabled={marking} className="text-[10px] font-bold text-[#d8552e] flex items-center gap-1 disabled:opacity-50"><CheckCheck size={13}/> Mark all read</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {role === 'seller' && subscription && showSubscriptionNotice && (
              <button
                onClick={() => {
                  dismissSubscription();
                  setOpen(false);
                  router.push('/seller/subscribe');
                }}
                className="flex w-full gap-3 border-b border-[#f5eee8] px-4 py-3 text-left hover:bg-[#fff8f4] bg-[#fff7f1]"
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e08a1e]" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[#251d18]">Seller subscription</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[#81756d]">{subscriptionText}</span>
                </span>
              </button>
            )}
            {notices.slice(0, 8).map((notice) => (
              <button key={notice.id} onClick={() => openNotice(notice)} className={`flex w-full gap-3 border-b border-[#f5eee8] px-4 py-3 text-left hover:bg-[#fff8f4] ${notice.read_at ? '' : 'bg-[#fff7f1]'}`}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notice.read_at ? 'bg-[#d9d0c9]' : 'bg-[#ef6b3b]'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-[#251d18]">{notice.title}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[#81756d]">{notice.message}</span>
                  <span className="mt-1 block text-[9px] text-[#a99c92]">{timeAgo(notice.created_at)}</span>
                </span>
              </button>
            ))}
            {notices.length === 0 && !showSubscriptionNotice && <p className="p-6 text-center text-xs text-[#81756d]">No notifications yet.</p>}
          </div>
          <PushNotificationToggle variant="inline" role={role} />
        </div>
      )}
    </div>
  );
}

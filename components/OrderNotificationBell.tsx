'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

interface OrderNotice {
  id: string;
  status: string;
  order_ref: string;
  created_at: string;
  products?: { title: string }[] | null;
}

type Props = { role: 'buyer' | 'seller'; className?: string };

const statusText: Record<string, string> = {
  in_escrow: 'Order received',
  packing: 'Seller is packing your order',
  ready_for_pickup: 'Ready for pickup',
  confirmed: 'Order received by you',
  completed: 'Order completed',
  cancelled: 'Order cancelled',
  rejected: 'Order rejected',
  disputed: 'Order has a dispute',
};

export default function OrderNotificationBell({ role, className = '' }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [orders, setOrders] = useState<OrderNotice[]>([]);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const storageKey = `fuhsi_order_notifications_${role}`;

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const query = supabase.from('orders').select('id,status,order_ref,created_at,products(title)').order('created_at', { ascending: false }).limit(30);
    const { data, error } = role === 'buyer'
      ? await query.eq('buyer_id', user.id)
      : await query.eq('seller_id', user.id);
    if (error || !data) return;

    const next = data as unknown as OrderNotice[];
    setOrders(next);

    const previous: Record<string, string> = JSON.parse(localStorage.getItem(`${storageKey}_snapshot`) || '{}');
    const storedUnread: string[] = JSON.parse(localStorage.getItem(`${storageKey}_unread`) || '[]');
    const current: Record<string, string> = {};
    const nextUnread = new Set(storedUnread);
    next.forEach(order => {
      current[order.id] = order.status;
      // First-seen paid seller orders and every later status transition are
      // notifications. Keep them unread until the user explicitly marks them read.
      if (!(order.id in previous)) {
        if (order.status === 'in_escrow') nextUnread.add(order.id);
      } else if (previous[order.id] !== order.status) {
        nextUnread.add(order.id);
      }
    });
    setUnreadIds(Array.from(nextUnread));
    localStorage.setItem(`${storageKey}_snapshot`, JSON.stringify(current));
    localStorage.setItem(`${storageKey}_unread`, JSON.stringify(Array.from(nextUnread)));
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [role]);

  const unread = useMemo(() => new Set(unreadIds), [unreadIds]);

  const openNotifications = () => {
    setOpen(v => !v);
    if (!open) return;
    setUnreadIds([]);
    localStorage.setItem(`${storageKey}_unread`, '[]');
  };

  const markRead = () => {
    const snapshot: Record<string, string> = {};
    orders.forEach(order => { snapshot[order.id] = order.status; });
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    setUnreadIds([]);
    localStorage.setItem(`${storageKey}_unread`, '[]');
  };

  return (
    <div className={`relative ${className}`}>
      <button onClick={openNotifications} aria-label={role === 'seller' ? 'Seller sales notifications' : 'Buyer order notifications'} className="relative grid h-10 w-10 place-items-center rounded-full bg-white/80 text-[#2e2520] shadow-sm border border-[#eee4dc]">
        <Bell size={18} />
        {unread.size > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ef6b3b] px-1 text-[9px] font-black text-white">{unread.size > 9 ? '9+' : unread.size}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[80] w-[min(90vw,340px)] overflow-hidden rounded-2xl border border-[#eee4dc] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#f0e9e2] px-4 py-3">
            <div><p className="text-sm font-black text-[#251d18]">Notifications</p><p className="text-[10px] text-[#81756d]">{role === 'seller' ? 'Sales and new paid orders' : 'Your order status updates'}</p></div>
            <button onClick={markRead} className="text-[10px] font-bold text-[#d8552e] flex items-center gap-1"><CheckCheck size={13}/> Mark read</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {orders.slice(0, 8).map(order => (
              <button key={order.id} onClick={() => { setOpen(false); router.push(role === 'seller' ? '/seller/orders' : '/buyer/orders'); }} className={`flex w-full gap-3 border-b border-[#f5eee8] px-4 py-3 text-left hover:bg-[#fff8f4] ${unread.has(order.id) ? 'bg-[#fff7f1]' : ''}`}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${unread.has(order.id) ? 'bg-[#ef6b3b]' : 'bg-[#d9d0c9]'}`} />
                <span className="min-w-0"><span className="block truncate text-xs font-bold text-[#251d18]">{order.products?.[0]?.title || 'Order'}</span><span className="mt-0.5 block text-[10px] leading-4 text-[#81756d]">{statusText[order.status] || order.status.replace(/_/g, ' ')} · {order.order_ref}</span></span>
              </button>
            ))}
            {orders.length === 0 && <p className="p-6 text-center text-xs text-[#81756d]">No order notifications yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

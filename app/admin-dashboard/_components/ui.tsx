import React from 'react';
import { formatNaira } from '@/utils/money';

export function fullNaira(kobo: number): string {
  return `₦${formatNaira(kobo)}`;
}

/** Short currency for KPI cards so large balances do not overflow. */
export function compactNaira(kobo: number): string {
  const naira = (Number(kobo) || 0) / 100;
  const abs = Math.abs(naira);
  if (abs >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}m`;
  if (abs >= 100_000) return `₦${(naira / 1_000).toFixed(0)}k`;
  if (abs >= 1_000) return `₦${(naira / 1_000).toFixed(1)}k`;
  return fullNaira(kobo);
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(iso);
}

const STATUS_TONES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  processing: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  in_escrow: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  packing: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  ready_for_pickup: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  paid: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  approved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  confirmed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  delivered: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/10 text-red-300 border-red-500/30',
  rejected: 'bg-red-500/10 text-red-300 border-red-500/30',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/30',
  disputed: 'bg-red-500/10 text-red-300 border-red-500/30',
  buyer: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  seller: 'bg-[#DE6437]/10 text-[#FFB08F] border-[#DE6437]/30',
  admin: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
};

export function statusTone(status?: string | null): string {
  return (status && STATUS_TONES[status]) || 'bg-white/5 text-neutral-300 border-white/10';
}

export function StatusPill({ status }: { status?: string | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${statusTone(status)}`}
    >
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[11px] text-neutral-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[11px] font-mono text-neutral-500">{children}</p>;
}

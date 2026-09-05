import { Clock } from 'lucide-react';

/**
 * Delivery-cutoff notice shown to buyers.
 * - Grocery / raw food orders placed before 12pm are delivered the same day.
 * - Student-made snacks / cooked-food items are delivered later in the day.
 * Stored server-side (static) for now so it reads exactly like this and can
 * be moved to the DB later if admin-editable copy is wanted.
 */
export default function DeliveryAnnouncement() {
  return (
    <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4">
      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-xl bg-red-600/20 border border-red-800/40 flex items-center justify-center">
          <Clock size={16} className="text-red-400" />
        </div>
        <div className="text-xs space-y-1">
          <p className="font-bold text-neutral-100 tracking-wide">
            Delivery windows
          </p>
          <p className="text-neutral-300 font-mono leading-relaxed">
            Grocery &amp; raw-food orders placed by <span className="text-white font-bold">12:00 pm</span> are delivered
            the same day. Student-made snacks &amp; cooked items are delivered later in the day.
          </p>
        </div>
      </div>
    </div>
  );
}
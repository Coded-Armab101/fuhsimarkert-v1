import { Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Delivery-cutoff notice shown to buyers.
 * - Grocery / raw food orders placed before 12pm are delivered the same day.
 * - Student-made snacks / cooked-food items are delivered later in the day.
 * Stored server-side (static) for now so it reads exactly like this and can
 * be moved to the DB later if admin-editable copy is wanted.
 */
export default function DeliveryAnnouncement() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem('fuhsi-delivery-note-hidden') === 'true') setVisible(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="rounded-2xl bg-[#fff0e9] p-4 text-[#5f4032]">
      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-xl bg-[#ef6b3b]/15 flex items-center justify-center">
          <Clock size={16} className="text-[#d8552e]" />
        </div>
        <div className="flex-1 text-xs space-y-1">
          <p className="font-bold tracking-wide">Delivery today</p>
          <p className="leading-relaxed text-[#795d4d]">
            Order groceries before <span className="font-bold text-[#4d3224]">12:00 pm</span> for same-day delivery. Snacks and cooked food come later in the day.
          </p>
        </div>
        <button
          onClick={() => { window.localStorage.setItem('fuhsi-delivery-note-hidden', 'true'); setVisible(false); }}
          className="h-7 w-7 grid place-items-center rounded-full text-[#9b7968] hover:bg-white/70"
          aria-label="Hide delivery message"
        ><X size={16} /></button>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';
import { createClient } from '@/utils/supabase';

type Props = {
  orderId: string;
  productId: string;
  productTitle: string;
};

/**
 * Inline verified-purchase review form shown on completed buyer orders.
 *
 * The `reviews` insert policy re-checks that this order row belongs to the
 * signed-in buyer, is for this product, and is completed — so this component
 * cannot be used to review something the buyer never received.
 */
export default function LeaveReview({ orderId, productId, productTitle }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('reviews')
        .select('rating')
        .eq('order_id', orderId)
        .eq('reviewer_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setExistingRating(data?.rating ?? null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [orderId, supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError('Tap a star to choose a rating.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in again to leave a review.');
        return;
      }

      const { error: insertError } = await supabase.from('reviews').insert({
        order_id: orderId,
        product_id: productId,
        reviewer_id: user.id,
        rating,
        comment: comment.trim() || null,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          setError('You already reviewed this item.');
        } else {
          setError('Could not save your review. Please try again.');
          console.error('[LeaveReview] insert failed', insertError);
        }
        return;
      }

      setExistingRating(rating);
    } catch (err) {
      console.error('[LeaveReview] failed', err);
      setError('Could not save your review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (existingRating) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl bg-[#faf6f2] px-3 py-2 text-[11px] font-medium text-[#81756d]">
        <CheckCircle2 size={13} className="text-[#17805b]" />
        You rated {productTitle} {existingRating}/5
      </p>
    );
  }

  const shown = hovered || rating;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#eee4dc] bg-white p-3">
      <p className="text-[11px] font-bold text-[#251d18]">Rate {productTitle}</p>
      <div className="mt-1 flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setRating(value); setError(null); }}
            onMouseEnter={() => setHovered(value)}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            className="p-0.5"
          >
            <Star
              size={20}
              fill={value <= shown ? '#f5a623' : 'none'}
              className={value <= shown ? 'text-[#f5a623]' : 'text-[#c9bfb2]'}
            />
          </button>
        ))}
        {rating > 0 && <span className="ml-1 text-[11px] font-bold text-[#81756d]">{rating}/5</span>}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional: how was the quantity, quality or packaging?"
        rows={2}
        maxLength={1000}
        className="mt-2 w-full resize-none rounded-xl border border-[#eee4dc] bg-[#faf6f2] px-3 py-2 text-[11px] text-[#251d18] placeholder:text-[#b4aaa2] outline-none focus:border-[#ef6b3b]"
      />

      {error && <p role="alert" className="mt-1 text-[10px] font-medium text-[#b04a27]">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-[#2e2520] px-4 py-2 text-[11px] font-bold text-white disabled:opacity-60"
      >
        {submitting ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
        {submitting ? 'Saving…' : 'Submit review'}
      </button>
    </form>
  );
}

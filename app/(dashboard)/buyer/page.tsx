'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { useCart } from '@/context/CartContext';
import { formatNaira } from '@/utils/money';
import { newShuffleSeed, seededShuffle } from '@/utils/shuffle';
import { productSearchFilter } from '@/utils/search';
import DeliveryAnnouncement from './DeliveryAnnouncement';
import { ChevronRight, Heart, Image as ImageIcon, Minus, Plus, Search, Star, X, MapPin, ShieldCheck } from 'lucide-react';
import OrderNotificationBell from '@/components/OrderNotificationBell';

type Product = { id: string; title: string; description?: string | null; price: number; image_url?: string | null; category?: string | null; hostel_location?: string | null; seller_id: string; created_at: string; stock?: number | null; unit?: string | null; delivery_fee_kobo?: number | null; rating?: number | null; review_count?: number | null; verified?: boolean | null; };
const isAvailable = (p: Product) => p.stock === null || p.stock === undefined || p.stock > 0;
const stockLimit = (p: Product) => p.stock === null || p.stock === undefined ? Infinity : Number(p.stock) || 0;
type Review = { id: string; rating: number; comment: string | null; created_at: string };

function ProductTile({ product, saved, onSave, onOpen, compact = false }: { product: Product; saved: boolean; onSave: () => void; onOpen: () => void; compact?: boolean; }) {
  const { addToCart, addToCartOnce, decreaseQuantity, getQuantity } = useCart();
  const quantity = getQuantity(product.id); const unavailable = !isAvailable(product);
  return <article className={compact ? 'w-[46%] min-w-[150px] sm:w-[190px]' : 'min-w-0'}>
    <div className="relative aspect-[.86] overflow-hidden rounded-[1.35rem] bg-[#f3eee8]">
      <button onClick={onOpen} className="absolute inset-0 z-0 w-full text-left" aria-label={`See ${product.title} details`} />
      {product.image_url ? <img src={product.image_url} alt={product.title} className="pointer-events-none h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="pointer-events-none absolute inset-0 m-auto text-[#c9bfb2]" size={30} />}
      {unavailable && <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-white">Sold out</span>}
      <button onClick={onSave} aria-label={saved ? 'Remove from saved items' : 'Save this item'} className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur ${saved ? 'bg-[#ef6b3b] text-white' : 'bg-white/90 text-[#312722]'}`}><Heart size={15} fill={saved ? 'currentColor' : 'none'} /></button>
    </div>
    <button onClick={onOpen} className="mt-2 block w-full text-left"><h3 className="line-clamp-1 text-sm font-bold text-[#251d18]">{product.title}{product.verified ? <ShieldCheck size={12} className="ml-1 inline text-[#17805b]" aria-label="Verified seller" /> : null}</h3><p className="mt-0.5 text-sm font-extrabold text-[#ef6b3b]">₦{formatNaira(product.price)}{product.unit ? <span className="text-[11px] font-semibold text-[#81756d]"> / {product.unit}</span> : null}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-[#81756d]"><Star size={12} fill={product.review_count ? '#f5a623' : 'none'} className="text-[#f5a623]" /> {product.review_count ? `${Number(product.rating ?? 0).toFixed(1)} (${product.review_count})` : 'No reviews yet'}</p></button>
    {!unavailable && (quantity ? <div className="mt-2 flex items-center gap-2"><span className="rounded-full bg-[#e8f7ef] px-2 py-1 text-[10px] font-bold text-[#17805b]">Added</span><div className="flex items-center gap-2 rounded-full bg-[#fff0e9] px-2 py-1 text-[#c9552e]"><button onClick={() => decreaseQuantity(product.id)} aria-label={`Remove one ${product.title}`}><Minus size={14} /></button><span className="w-4 text-center text-xs font-bold">{quantity}</span><button onClick={() => addToCart(product)} disabled={quantity >= stockLimit(product)} aria-label={`Add one ${product.title}`}><Plus size={14} /></button></div></div> : <button onClick={() => addToCartOnce(product)} className="mt-2 rounded-full bg-[#2e2520] px-3 py-1.5 text-[11px] font-bold text-white">Add to cart</button>)}
  </article>;
}

export default function BuyerDashboardPage() {
  const router = useRouter(); const supabase = createClient(); const { addToCart, addToCartOnce, startCartWith, decreaseQuantity, getQuantity } = useCart();
  const [products, setProducts] = useState<Product[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [category, setCategory] = useState('All'); const [shuffleSeed] = useState(newShuffleSeed); const [selected, setSelected] = useState<Product | null>(null); const [wishlistIds, setWishlistIds] = useState<Record<string, string>>({}); const [userId, setUserId] = useState<string | null>(null); const [selectedReviews, setSelectedReviews] = useState<Review[]>([]);
  useEffect(() => { (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; setUserId(user.id); const { data } = await supabase.from('wishlists').select('id, product_id').eq('user_id', user.id); setWishlistIds(Object.fromEntries((data || []).map(row => [row.product_id, row.id]))); })(); }, [supabase]);
  // Reviews are public (verified buyers only can write them), so the detail
  // sheet can show the latest few without exposing any profile data.
  useEffect(() => {
    let cancelled = false;
    const productId = selected?.id;
    if (!productId) return;
    (async () => {
      const { data } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!cancelled) setSelectedReviews((data as Review[]) || []);
    })();
    return () => { cancelled = true; };
  }, [selected?.id, supabase]);
  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setLoading(true);
      const term = search.trim();
      let rows: Product[] = [];

      if (term) {
        // `search_products` also matches the seller's name (profiles RLS hides
        // those rows from the client). If the migration has not been applied
        // yet, fall back to title/description/category via PostgREST.
        const { data: rpcRows, error: rpcError } = await supabase.rpc('search_products', { p_query: term });
        if (!rpcError && Array.isArray(rpcRows)) {
          rows = rpcRows as Product[];
        } else {
          if (rpcError) console.warn('search_products unavailable, using fallback filter:', rpcError.message);
          let query = supabase.from('products').select('*').eq('is_available', true);
          const filter = productSearchFilter(term);
          if (filter) query = query.or(filter);
          const { data } = await query;
          rows = (data as Product[]) || [];
        }
      } else {
        const { data } = await supabase.from('products').select('*').eq('is_available', true);
        rows = (data as Product[]) || [];
      }

      if (cancelled) return;

      // Real ratings live behind the `product_ratings` view. If it is missing
      // (migration not applied), cards simply show "No reviews yet".
      if (rows.length) {
        const ids = rows.map((row) => row.id);
        const { data: ratingRows } = await supabase
          .from('product_ratings')
          .select('product_id, rating_avg, review_count')
          .in('product_id', ids);
        if (ratingRows?.length) {
          const byId = new Map(ratingRows.map((row) => [row.product_id, row]));
          rows = rows.map((row) => {
            const rating = byId.get(row.id);
            return { ...row, rating: rating?.rating_avg ?? null, review_count: Number(rating?.review_count ?? 0) };
          });
        }
      }

      // Verified seller badges. profiles is RLS-protected, so the boolean comes
      // from a SECURITY DEFINER RPC that exposes nothing but the badge.
      if (rows.length) {
        const sellerIds = Array.from(new Set(rows.map((row) => row.seller_id).filter(Boolean)));
        if (sellerIds.length > 0) {
          const { data: verifiedRows, error: verifiedError } = await supabase.rpc(
            'verified_seller_ids',
            { p_ids: sellerIds },
          );
          if (!verifiedError && Array.isArray(verifiedRows)) {
            const verified = new Set(
              (verifiedRows as { id: string; is_verified: boolean }[])
                .filter((row) => row.is_verified)
                .map((row) => row.id),
            );
            rows = rows.map((row) => ({ ...row, verified: verified.has(row.seller_id) }));
          }
        }
      }

      if (cancelled) return;
      setProducts(rows);
      setLoading(false);
    }, 250);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, supabase]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[]))], [products]);
  // A fresh seed on every visit/login keeps the feed scattered instead of
  // freezing every account into the same order. Products start empty, so the
  // random seed cannot cause a server/client hydration mismatch.
  const activeQuery = search.trim();
  // A search already hits the database, so a leftover category chip must not
  // hide a product that does exist.
  const shown = useMemo(() => { const base = activeQuery || category === 'All' ? products : products.filter(p => p.category === category); return seededShuffle(base, shuffleSeed); }, [products, category, shuffleSeed, activeQuery]); const hot = useMemo(() => [...shown].sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a))).slice(0, 8), [shown]); const noResults = !loading && Boolean(activeQuery) && shown.length === 0;
  const toggleSaved = async (productId: string) => { const rowId = wishlistIds[productId]; if (rowId) { const { error } = await supabase.from('wishlists').delete().eq('id', rowId); if (!error) setWishlistIds(old => { const next = { ...old }; delete next[productId]; return next; }); return; } if (!userId) return; const { data, error } = await supabase.from('wishlists').insert({ user_id: userId, product_id: productId }).select('id, product_id').single(); if (!error && data) setWishlistIds(old => ({ ...old, [data.product_id]: data.id })); };
  const selectedQuantity = selected ? getQuantity(selected.id) : 0;
  // Buy now is a one-item purchase: replace the cart instead of appending, so
  // items left over from another account/session are not charged with it.
  const buyNow = () => { if (!selected || !isAvailable(selected) || selectedQuantity > 0) return; startCartWith(selected); router.push('/buyer/cart?checkout=1'); };
  const productSkeleton = <div className="flex gap-3 animate-pulse">{[1, 2].map(item => <div key={item} className="w-[46%] min-w-[150px] sm:w-[190px]"><div className="aspect-[.86] rounded-[1.35rem] bg-[#eee4dc]" /><div className="mt-3 h-3 w-3/4 rounded bg-[#eee4dc]" /><div className="mt-2 h-3 w-1/2 rounded bg-[#f4eee9]" /></div>)}</div>;
  return <div className="mx-auto max-w-5xl pb-12"><section className="-mx-4 rounded-b-[2rem] bg-gradient-to-br from-[#ff9a55] via-[#f47a3f] to-[#d9552f] px-5 pb-6 pt-6 text-white shadow-[0_10px_30px_rgba(213,85,47,.2)]"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-white/75">Your campus market</p><h1 className="mt-1 text-3xl font-black tracking-tight">FuhsiMarket</h1></div><OrderNotificationBell role="buyer" className="[&>button]:bg-white/20 [&>button]:border-white/20 [&>button]:text-white" /></div><label className="mt-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-[#6f625a] shadow-lg"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search food, books, gadgets..." className="min-w-0 flex-1 bg-transparent text-sm text-[#251d18] outline-none placeholder:text-[#9d9188]" /><Search size={18} className="text-[#ef6b3b]" /></label><div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${category === item ? 'bg-[#2e2520] text-white shadow-lg' : 'bg-white/20 text-white'}`}>{item}</button>)}</div></section><div className="px-1 pt-6"><DeliveryAnnouncement />{noResults ? <section className="mt-10 rounded-[1.75rem] border border-[#eee4dc] bg-white p-8 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#fff0e9]"><Search size={24} className="text-[#ef6b3b]" /></div><h2 className="mt-4 text-lg font-black text-[#251d18]">“{activeQuery}” doesn’t exist</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#81756d]">No product matches that search. Check the spelling, try a shorter word, or browse everything around campus.</p><button onClick={() => { setSearch(''); setCategory('All'); }} className="mt-5 rounded-full bg-[#2e2520] px-5 py-3 text-sm font-bold text-white hover:bg-black transition-colors">Clear search</button></section> : <><section className="mt-7"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-[#251d18]">{activeQuery ? 'Search results' : 'Around campus'}</h2><p className="text-xs text-[#81756d]">{activeQuery ? `Matches for “${activeQuery}”` : 'Scattered picks from students'}</p></div><ChevronRight className="text-[#ef6b3b]" /></div><div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none]">{loading ? productSkeleton : shown.slice(0, 8).map(p => <ProductTile key={p.id} product={p} saved={!!wishlistIds[p.id]} onSave={() => toggleSaved(p.id)} onOpen={() => setSelected(p)} compact />)}</div></section><section className="mt-6"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-[#251d18]">Hot right now</h2><p className="text-xs text-[#81756d]">Popular picks for student life</p></div><ChevronRight className="text-[#ef6b3b]" /></div><div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none]">{loading ? productSkeleton : hot.map(p => <ProductTile key={p.id} product={p} saved={!!wishlistIds[p.id]} onSave={() => toggleSaved(p.id)} onOpen={() => setSelected(p)} compact />)}</div></section><section className="mt-7"><h2 className="text-lg font-black text-[#251d18]">More for you</h2><p className="mb-4 text-xs text-[#81756d]">Browse everything in {category === 'All' ? 'the market' : category}</p>{loading ? <div className="grid grid-cols-2 gap-3 animate-pulse">{[1,2,3,4].map(item => <div key={item}><div className="aspect-[.86] rounded-[1.35rem] bg-[#eee4dc]" /><div className="mt-3 h-3 w-3/4 rounded bg-[#eee4dc]" /></div>)}</div> : shown.length ? <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">{shown.map(p => <ProductTile key={p.id} product={p} saved={!!wishlistIds[p.id]} onSave={() => toggleSaved(p.id)} onOpen={() => setSelected(p)} />)}</div> : <p className="py-12 text-center text-sm text-[#81756d]">No items match that search yet.</p>}</section></>}</div>{selected && <div className="fixed inset-0 z-[60] flex items-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-4"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 sm:max-w-md sm:rounded-[2rem]"><div className="relative aspect-square overflow-hidden rounded-[1.5rem] bg-[#f3eee8]">{selected.image_url ? <img src={selected.image_url} alt={selected.title} className="h-full w-full object-cover" /> : <ImageIcon className="absolute inset-0 m-auto text-[#c9bfb2]" size={44}/>}<button onClick={() => setSelected(null)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-[#251d18]" aria-label="Close details"><X size={18}/></button></div><div className="mt-5"><p className="text-xs font-bold text-[#ef6b3b]">{selected.category || 'Campus item'}</p><div className="mt-1 flex items-start justify-between gap-4"><h2 className="text-xl font-black text-[#251d18]">{selected.title}</h2><span className="shrink-0 text-xl font-black text-[#ef6b3b]">₦{formatNaira(selected.price)}{selected.unit ? <span className="text-xs font-semibold text-[#81756d]"> / {selected.unit}</span> : null}</span></div><p className="mt-2 flex items-center gap-1 text-xs text-[#81756d]"><Star size={14} fill={selected.review_count ? '#f5a623' : 'none'} className="text-[#f5a623]" /> {selected.review_count ? `${Number(selected.rating ?? 0).toFixed(1)} rating from ${selected.review_count} student${selected.review_count === 1 ? '' : 's'}` : 'No reviews yet — be the first'}</p>{selectedReviews.length > 0 && <div className="mt-3 space-y-2">{selectedReviews.map(review => <div key={review.id} className="rounded-xl bg-[#faf6f2] p-3"><p className="flex items-center gap-1 text-[11px] font-bold text-[#251d18]"><Star size={11} fill="#f5a623" className="text-[#f5a623]" /> {review.rating}/5 <span className="font-normal text-[#81756d]">· verified buyer</span></p>{review.comment && <p className="mt-1 text-xs leading-5 text-[#5f534b]">{review.comment}</p>}</div>)}</div>}<p className="mt-4 text-sm leading-6 text-[#5f534b]">{selected.description || 'Ask the seller for more details before you buy.'}</p>{selected.hostel_location && <p className="mt-3 flex items-center gap-2 text-xs font-medium text-[#5f534b]"><MapPin size={15} className="text-[#ef6b3b]"/>{selected.hostel_location}</p>}<p className="mt-3 flex items-start gap-2 rounded-xl bg-[#fff4ed] p-3 text-xs leading-5 text-[#7c4a38]"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>Your money stays safe until you confirm you received your order.</p></div><div className="mt-5 flex gap-3">{selectedQuantity > 0 && <div className="flex items-center gap-3 rounded-2xl bg-[#fff0e9] px-3 text-[#c9552e]"><button onClick={() => decreaseQuantity(selected.id)}><Minus size={17}/></button><span className="text-sm font-bold">{selectedQuantity}</span><button onClick={() => addToCart(selected)} disabled={selectedQuantity >= stockLimit(selected)}><Plus size={17}/></button></div>}<button onClick={() => { addToCartOnce(selected); const el = document.getElementById('detail-cart-confirm'); if (el) el.textContent = 'Added to cart ✓'; window.setTimeout(() => setSelected(null), 650); }} disabled={!isAvailable(selected) || selectedQuantity > 0 || selectedQuantity >= stockLimit(selected)} className="flex-1 rounded-2xl bg-[#ef6b3b] py-3.5 text-sm font-bold text-white disabled:bg-[#c9bfb2]"><span id="detail-cart-confirm">{selectedQuantity > 0 ? 'Already in cart' : isAvailable(selected) ? 'Add to cart' : 'Sold out'}</span></button>{selectedQuantity === 0 && <button onClick={buyNow} disabled={!isAvailable(selected)} className="flex-1 rounded-2xl bg-[#2e2520] py-3.5 text-sm font-bold text-white disabled:bg-[#c9bfb2]">Buy now</button>}</div></div></div>}</div>;
}

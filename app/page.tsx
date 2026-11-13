'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { useCart } from '@/context/CartContext';
import { formatNaira } from '@/utils/money';
import { FEATURED_CATEGORIES } from '@/utils/categories';
import { newShuffleSeed, seededShuffle } from '@/utils/shuffle';
import { productSearchFilter } from '@/utils/search';
import BrandLogo from '@/components/BrandLogo';
import {
  ArrowRight,
  Heart,
  Image as ImageIcon,
  Lock,
  MapPin,
  Minus,
  Plus,
  Search,
  SearchX,
  ShieldCheck,
  ShoppingCart,
  Shuffle,
  Store,
  User,
  X,
} from 'lucide-react';

type Product = {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  category?: string | null;
  hostel_location?: string | null;
  seller_id: string;
  created_at: string;
  stock?: number | null;
  unit?: string | null;
  delivery_fee_kobo?: number | null;
  verified?: boolean | null;
};

const isAvailable = (p: Product) =>
  p.stock === null || p.stock === undefined || p.stock > 0;

const stockLimit = (p: Product) =>
  p.stock === null || p.stock === undefined ? Infinity : Number(p.stock) || 0;

function ProductCard({
  product,
  saved,
  onSave,
  onOpen,
  onRequireAuth,
  userAuthenticated,
}: {
  product: Product;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onRequireAuth: () => void;
  userAuthenticated: boolean;
}) {
  const { addToCart, addToCartOnce, decreaseQuantity, getQuantity } = useCart();
  const quantity = getQuantity(product.id);
  const unavailable = !isAvailable(product);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userAuthenticated) {
      onRequireAuth();
      return;
    }
    addToCartOnce(product);
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userAuthenticated) {
      onRequireAuth();
      return;
    }
    addToCart(product);
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userAuthenticated) {
      onRequireAuth();
      return;
    }
    decreaseQuantity(product.id);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-[#ECE5DE] bg-white shadow-[0_6px_20px_rgba(44,44,44,0.04)] transition-shadow hover:shadow-[0_10px_30px_rgba(44,44,44,0.08)]">
      <div
        className="relative aspect-[4/5] w-full cursor-pointer overflow-hidden bg-[#F5F1EC]"
        onClick={onOpen}
      >
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="absolute inset-0 m-auto text-[#CFC5BA]" size={34} />
        )}

        {unavailable && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-[#2C2C2C]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            Sold out
          </span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          aria-label={saved ? 'Remove from saved' : 'Save item'}
          className={`absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full backdrop-blur transition-colors ${
            saved ? 'bg-[#DE6437] text-white' : 'bg-white/90 text-[#2C2C2C] hover:bg-white'
          }`}
        >
          <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="cursor-pointer" onClick={onOpen}>
          {product.category && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#DE6437]">
              {product.category}
            </span>
          )}
          <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-[#2C2C2C] transition-colors group-hover:text-[#DE6437]">
            {product.title}
            {product.verified ? (
              <ShieldCheck
                size={12}
                className="ml-1 inline text-[#17805B]"
                aria-label="Verified seller"
              />
            ) : null}
          </h3>
          {product.hostel_location && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-[#81756D]">
              <MapPin size={11} className="shrink-0" />
              {product.hostel_location}
            </p>
          )}
        </div>

        <div className="mt-auto pt-2">
          <p className="text-base font-black text-[#2C2C2C]">
            ₦{formatNaira(product.price)}
            {product.unit ? (
              <span className="text-[11px] font-semibold text-[#81756D]"> / {product.unit}</span>
            ) : null}
          </p>

          {!unavailable &&
            (quantity > 0 ? (
              <div className="mt-2 flex items-center justify-between rounded-full bg-[#FDF0EA] px-2 py-1 text-xs font-bold text-[#DE6437]">
                <button
                  onClick={handleDecrease}
                  className="rounded-full p-1 transition-colors hover:bg-[#F8DFD4]"
                  aria-label={`Remove one ${product.title}`}
                >
                  <Minus size={14} />
                </button>
                <span className="font-mono">{quantity}</span>
                <button
                  onClick={handleIncrease}
                  disabled={quantity >= stockLimit(product)}
                  className="rounded-full p-1 transition-colors hover:bg-[#F8DFD4] disabled:opacity-40"
                  aria-label={`Add one ${product.title}`}
                >
                  <Plus size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleAddToCart}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#DE6437] py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-[#C9511F]"
              >
                <ShoppingCart size={13} />
                <span>Add to cart</span>
              </button>
            ))}
        </div>
      </div>
    </article>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { totalItems, addToCartOnce, startBuyNow } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Product | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Record<string, string>>({});
  // A fresh seed per visit keeps the catalogue from freezing into the same
  // order for everyone. It is also reset on every sign-in/sign-out below, so
  // logging out and back in shows a genuinely new arrangement.
  const [shuffleSeed, setShuffleSeed] = useState(newShuffleSeed);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        const { data } = await supabase
          .from('wishlists')
          .select('id, product_id')
          .eq('user_id', currentUser.id);
        if (data) {
          setWishlistIds(Object.fromEntries(data.map((row) => [row.product_id, row.id])));
        }
      }
    };
    checkAuth();

    // `getUser` only runs on mount, but signing in or out can happen without a
    // full page reload. Reshuffle on both so the first screen after login is
    // never the same order as the last screen before logout.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setShuffleSeed(newShuffleSeed());
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      setLoadFailed(false);

      try {
        const term = search.trim();
        let data: Product[] | null = null;
        let error: { message: string } | null = null;

        if (term) {
          const { data: rpcRows, error: rpcError } = await supabase.rpc('search_products', { p_query: term });
          if (!rpcError && Array.isArray(rpcRows)) {
            data = rpcRows as Product[];
          } else {
            if (rpcError) console.warn('search_products unavailable, using fallback filter:', rpcError.message);
            let query = supabase.from('products').select('*').eq('is_available', true);
            const filter = productSearchFilter(term);
            if (filter) query = query.or(filter);
            const result = await query;
            data = (result.data as Product[]) || null;
            error = result.error;
          }
        } else {
          const result = await supabase.from('products').select('*').eq('is_available', true);
          data = (result.data as Product[]) || null;
          error = result.error;
        }

        if (cancelled) return;

        if (error) {
          console.error('Failed to fetch landing products:', error);
          setProducts([]);
          setLoadFailed(true);
          return;
        }

        // Verified-seller badges come from a SECURITY DEFINER RPC so the
        // catalogue never has to expose the protected profiles rows.
        let rows = data || [];
        if (rows.length > 0) {
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

        // No demo rows: an empty catalogue stays empty.
        setProducts(rows);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch landing products:', err);
        setProducts([]);
        setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(fetchProducts, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, supabase]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = ['All'];
    const candidates: string[] = [
      ...FEATURED_CATEGORIES,
      ...products
        .map((p) => p.category)
        .filter((value): value is string => Boolean(value)),
    ];

    for (const value of candidates) {
      if (value && !seen.has(value)) {
        seen.add(value);
        list.push(value);
      }
    }
    return list;
  }, [products]);

  // Display order is deliberately scattered rather than newest-first so one
  // seller cannot own the top of the feed. The seed is fresh on every visit and
  // changes again on login/logout and when the user taps Shuffle, so re-renders
  // never make tiles jump but each session gets a different layout.
  const shuffledProducts = useMemo(
    () => seededShuffle(products, shuffleSeed),
    [products, shuffleSeed]
  );

  const activeQuery = search.trim();

  const shownProducts = useMemo(() => {
    // A search runs against the whole catalogue (the query hits the database),
    // so a leftover category chip must not hide a product that does exist.
    if (activeQuery || category === 'All') return shuffledProducts;
    return shuffledProducts.filter((p) => p.category === category);
  }, [shuffledProducts, category, activeQuery]);

  const requireAuth = () => {
    router.push('/login?redirect=/');
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      requireAuth();
      return;
    }

    const rowId = wishlistIds[productId];
    if (rowId) {
      const { error } = await supabase.from('wishlists').delete().eq('id', rowId);
      if (!error) {
        setWishlistIds((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }
    } else {
      const { data, error } = await supabase
        .from('wishlists')
        .insert({ user_id: user.id, product_id: productId })
        .select('id, product_id')
        .single();
      if (!error && data) {
        setWishlistIds((prev) => ({ ...prev, [data.product_id]: data.id }));
      }
    }
  };

  const handleBuyNowModal = () => {
    if (!user) {
      requireAuth();
      return;
    }
    if (selected) {
      startBuyNow(selected);
      router.push('/buyer/cart?checkout=1&buyNow=1');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFA] pb-24 font-sans text-[#2C2C2C]">
      <header className="sticky top-0 z-40 border-b border-[#ECE5DE] bg-[#FAFAFA]/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <BrandLogo height={38} />

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (!user) requireAuth();
                else router.push('/buyer/cart');
              }}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-[#ECE5DE] bg-white text-[#2C2C2C] transition-colors hover:border-[#DE6437] hover:text-[#DE6437]"
              aria-label="Open cart"
            >
              <ShoppingCart size={19} />
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#DE6437] px-1 text-[10px] font-black text-white">
                  {totalItems}
                </span>
              )}
            </button>

            <Link
              href={user ? '/buyer' : '/login'}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#ECE5DE] bg-white text-[#2C2C2C] transition-colors hover:border-[#DE6437] hover:text-[#DE6437]"
              aria-label={user ? 'Open your account' : 'Sign in'}
            >
              <User size={19} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {/* App-style onboarding hero */}
        <section className="relative overflow-hidden rounded-[2rem] bg-[#DE6437] px-5 pb-5 pt-6 text-white shadow-[0_14px_40px_rgba(222,100,55,0.24)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FFA726]/40 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-black/10 blur-2xl"
          />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]">
              <ShieldCheck size={13} />
              FUHSI campus marketplace
            </span>
            <h1 className="mt-3 text-[1.7rem] font-black leading-[1.15] tracking-tight">
              Buy and sell simply with FUHSI students.
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/85">
              Textbooks, gadgets, food and hostel essentials — safely handed over on campus with escrow protection.
            </p>

            <div className="mt-5 flex items-center gap-2.5">
              <a
                href="#feed"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-[#DE6437] transition-transform active:scale-95"
              >
                Browse the market
                <ArrowRight size={15} />
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center rounded-full border border-white/40 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/10"
              >
                Start selling
              </Link>
            </div>
          </div>
        </section>

        {/* Search */}
        <label className="mt-4 flex items-center gap-2.5 rounded-2xl border border-[#ECE5DE] bg-white px-4 py-3 shadow-sm">
          <Search size={18} className="shrink-0 text-[#81756D]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search textbooks, gadgets, food..."
            className="min-w-0 flex-1 bg-transparent text-sm text-[#2C2C2C] outline-none placeholder:text-[#A79C92]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="grid h-6 w-6 place-items-center rounded-full bg-[#F3EEE9] text-[#81756D]"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </label>

        {/* Category chips — hidden while searching, because search already
            covers the whole catalogue and an empty chip row under a "no
            result" message is confusing. */}
        {!activeQuery && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {categoryOptions.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                  category === item
                    ? 'bg-[#2C2C2C] text-white'
                    : 'border border-[#ECE5DE] bg-white text-[#5F5650] hover:border-[#DE6437] hover:text-[#DE6437]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {/* Feed */}
        <section id="feed" className="mt-5 scroll-mt-24">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-[#2C2C2C]">
                {activeQuery ? 'Search results' : 'Around campus'}
              </h2>
              <p className="text-xs text-[#81756D]">
                {activeQuery
                  ? shownProducts.length > 0
                    ? `${shownProducts.length} listing${shownProducts.length === 1 ? '' : 's'} for “${activeQuery}”`
                    : `Nothing on FuhsiMarket matches “${activeQuery}”`
                  : 'A scattered mix of student listings'}
              </p>
            </div>
            {!activeQuery && (
              <button
                onClick={() => setShuffleSeed(newShuffleSeed())}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#ECE5DE] bg-white px-3 py-2 text-[11px] font-bold text-[#5F5650] transition-colors hover:border-[#DE6437] hover:text-[#DE6437]"
              >
                <Shuffle size={14} />
                Shuffle
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-pulse overflow-hidden rounded-3xl border border-[#ECE5DE] bg-white"
                >
                  <div className="aspect-[4/5] bg-[#F1ECE6]" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-1/2 rounded bg-[#F1ECE6]" />
                    <div className="h-3 w-4/5 rounded bg-[#F1ECE6]" />
                    <div className="h-8 w-full rounded-full bg-[#F1ECE6]" />
                  </div>
                </div>
              ))}
            </div>
          ) : shownProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {shownProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  saved={!!wishlistIds[p.id]}
                  onSave={() => toggleWishlist(p.id)}
                  onOpen={() => setSelected(p)}
                  onRequireAuth={requireAuth}
                  userAuthenticated={!!user}
                />
              ))}
            </div>
          ) : loadFailed ? (
            <div className="rounded-3xl border border-dashed border-[#DCD4CB] bg-white px-6 py-12 text-center">
              <Store size={34} className="mx-auto text-[#CFC5BA]" />
              <p className="mt-3 text-sm font-bold text-[#2C2C2C]">
                The market is taking a break
              </p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#81756D]">
                We could not load listings right now. Check your connection and try again shortly.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#DE6437] px-4 py-2.5 text-xs font-bold text-white"
              >
                Try again
                <ArrowRight size={14} />
              </button>
            </div>
          ) : activeQuery ? (
            <div className="rounded-3xl border border-dashed border-[#DCD4CB] bg-white px-6 py-12 text-center">
              <SearchX size={34} className="mx-auto text-[#CFC5BA]" />
              <p className="mt-3 text-base font-black text-[#2C2C2C]">Product not found</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#81756D]">
                “{activeQuery}” does not exist on FuhsiMarket right now. Check the spelling or
                try a shorter word.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => setSearch('')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#DE6437] px-4 py-2.5 text-xs font-bold text-white"
                >
                  Clear search
                  <X size={14} />
                </button>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#ECE5DE] bg-white px-4 py-2.5 text-xs font-bold text-[#5F5650] transition-colors hover:border-[#DE6437] hover:text-[#DE6437]"
                >
                  Sell it instead
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ) : category !== 'All' ? (
            <div className="rounded-3xl border border-dashed border-[#DCD4CB] bg-white px-6 py-12 text-center">
              <Store size={34} className="mx-auto text-[#CFC5BA]" />
              <p className="mt-3 text-sm font-bold text-[#2C2C2C]">
                Nothing in {category} yet
              </p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#81756D]">
                No one has listed a product in this category yet. Try another category or
                browse everything on the market.
              </p>
              <button
                onClick={() => setCategory('All')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#DE6437] px-4 py-2.5 text-xs font-bold text-white"
              >
                Browse all products
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[#DCD4CB] bg-white px-6 py-12 text-center">
              <Store size={34} className="mx-auto text-[#CFC5BA]" />
              <p className="mt-3 text-sm font-bold text-[#2C2C2C]">No listings yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#81756D]">
                Be the first student to list something on FuhsiMarket.
              </p>
              <Link
                href="/signup"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#DE6437] px-4 py-2.5 text-xs font-bold text-white"
              >
                Start selling
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>

        <footer className="mt-10 border-t border-[#ECE5DE] pb-2 pt-6 text-center">
          <div className="flex justify-center">
            <BrandLogo height={34} />
          </div>
          <p className="mt-2 text-xs text-[#81756D]">
            Buy and sell simply with FUHSI students · fuhsimarket.com.ng
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-semibold text-[#81756D]">
            <Link href="/terms" className="hover:text-[#DE6437]">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[#DE6437]">
              Privacy
            </Link>
            <Link href="/marketplace" className="hover:text-[#DE6437]">
              Marketplace
            </Link>
          </div>
        </footer>
      </main>

      {/* App-style bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ECE5DE] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-4 py-2">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 rounded-xl px-4 py-1 text-[#DE6437]"
          >
            <Store size={20} />
            <span className="text-[10px] font-bold">Home</span>
          </Link>
          <a
            href="#feed"
            className="flex flex-col items-center gap-1 rounded-xl px-4 py-1 text-[#81756D]"
          >
            <Search size={20} />
            <span className="text-[10px] font-bold">Browse</span>
          </a>
          <button
            onClick={() => {
              if (!user) requireAuth();
              else router.push('/buyer/cart');
            }}
            className="relative flex flex-col items-center gap-1 rounded-xl px-4 py-1 text-[#81756D]"
          >
            <ShoppingCart size={20} />
            <span className="text-[10px] font-bold">Cart</span>
            {totalItems > 0 && (
              <span className="absolute right-2 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-[#DE6437] px-1 text-[9px] font-black text-white">
                {totalItems}
              </span>
            )}
          </button>
          <Link
            href={user ? '/buyer' : '/login'}
            className="flex flex-col items-center gap-1 rounded-xl px-4 py-1 text-[#81756D]"
          >
            <User size={20} />
            <span className="text-[10px] font-bold">{user ? 'Account' : 'Sign in'}</span>
          </Link>
        </div>
      </nav>

      {/* Product detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.title}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#FAFAFA] p-5 shadow-2xl sm:rounded-[2rem]"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-[1.5rem] bg-[#F1ECE6]">
              {selected.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.image_url}
                  alt={selected.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="absolute inset-0 m-auto text-[#CFC5BA]" size={48} />
              )}
              <button
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-[#2C2C2C] shadow-md transition-colors hover:bg-[#F3EEE9]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {selected.category && (
                <span className="text-[11px] font-black uppercase tracking-wider text-[#DE6437]">
                  {selected.category}
                </span>
              )}

              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-black leading-tight text-[#2C2C2C]">
                  {selected.title}
                </h2>
                <span className="shrink-0 text-xl font-black text-[#DE6437]">
                  ₦{formatNaira(selected.price)}
                  {selected.unit ? (
                    <span className="text-xs font-semibold text-[#81756D]"> / {selected.unit}</span>
                  ) : null}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-[#5F5650]">
                {selected.description || 'No additional details provided by the seller.'}
              </p>

              {selected.hostel_location && (
                <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-[#5F5650]">
                  <MapPin size={15} className="text-[#DE6437]" />
                  <span>Hostel / location: {selected.hostel_location}</span>
                </div>
              )}

              <div className="flex items-center gap-2 rounded-2xl bg-[#FDF0EA] p-3 text-xs font-bold text-[#C9511F]">
                <ShieldCheck size={18} className="shrink-0" />
                <span>Escrow protected: money is released only when you confirm receipt.</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              {!user ? (
                <button
                  onClick={requireAuth}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#DE6437] py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#C9511F]"
                >
                  <Lock size={16} />
                  <span>Sign in to buy</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      addToCartOnce(selected);
                      setSelected(null);
                    }}
                    className="flex-1 rounded-full bg-[#DE6437] py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-[#C9511F]"
                  >
                    Add to cart
                  </button>
                  <button
                    onClick={handleBuyNowModal}
                    className="flex-1 rounded-full bg-[#2C2C2C] py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-black"
                  >
                    Buy now
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { useCart } from '@/context/CartContext';
import { formatNaira } from '@/utils/money';
import {
  Search,
  ShoppingCart,
  User,
  Zap,
  Flame,
  Award,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  Minus,
  Plus,
  Star,
  X,
  MapPin,
  ShieldCheck,
  Store,
  Sparkles,
  Lock,
  ArrowRight,
  TrendingUp,
  Tag,
  Clock,
  CheckCircle,
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
};

const isAvailable = (p: Product) => p.stock === null || p.stock === undefined || p.stock > 0;
const stockLimit = (p: Product) => (p.stock === null || p.stock === undefined ? Infinity : Number(p.stock) || 0);

const DEFAULT_CAMPUS_PRODUCTS: Product[] = [
  {
    id: 'demo-1',
    title: 'Anker Power Bank 20,000mAh PowerCore Fast Charge',
    description: 'Essential for lecture days and hostel power outages. Dual USB output, fast charging.',
    price: 18500,
    category: 'Tech & Gadgets',
    hostel_location: 'Medical Hostel B',
    seller_id: 'demo-seller',
    created_at: new Date().toISOString(),
    stock: 5,
    image_url: 'https://images.unsplash.com/photo-1609592424109-dd9892f1b177?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-2',
    title: 'Medical Physiology Textbook (14th Edition, Guyton & Hall)',
    description: 'Clean medical textbook with no highlights or missing pages. Perfect for 200/300L med students.',
    price: 12000,
    category: 'Books',
    hostel_location: 'Block A, Male Hostel',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    stock: 2,
    image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-3',
    title: 'Rechargeable Mini Desk Fan with LED Light',
    description: 'Quiet 3-speed brushless motor, 4000mAh battery lasts up to 8 hours on low.',
    price: 8500,
    category: 'Campus Essentials',
    hostel_location: 'Female Hostel C',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    stock: 8,
    image_url: 'https://images.unsplash.com/photo-1618941723628-e2743388762d?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-4',
    title: 'Nike Air Force 1 Low White (Size 43)',
    description: 'Lightly worn campus sneakers, clean soles and original box included.',
    price: 24000,
    category: 'Fashion',
    hostel_location: 'New Extension Hostel',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 10800000).toISOString(),
    stock: 1,
    image_url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-5',
    title: '1.5L Electric Cooking Kettle / Boiling Pot',
    description: 'Stainless steel interior, fast boiling, auto shutoff. Perfect for instant noodles and tea.',
    price: 9500,
    category: 'Campus Essentials',
    hostel_location: 'Postgraduate Hall',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 14400000).toISOString(),
    stock: 4,
    image_url: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f6?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-6',
    title: 'Crunchy Homemade Chocolate Cookies (Box of 12)',
    description: 'Freshly baked daily on campus. Rich chocolate chips and butter crunch.',
    price: 3500,
    category: 'Food & Snacks',
    hostel_location: 'Campus Cafeteria Area',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 18000000).toISOString(),
    stock: 15,
    image_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-7',
    title: 'Apple AirPods Pro 2nd Gen (Active Noise Cancellation)',
    description: 'Clean wireless earbuds with MagSafe charging case and spare silicone tips.',
    price: 45000,
    category: 'Tech & Gadgets',
    hostel_location: 'Block D, Male Hostel',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 21600000).toISOString(),
    stock: 2,
    image_url: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'demo-8',
    title: 'Ergonomic Mesh Study Chair with Lumbar Support',
    description: 'Comfy height-adjustable chair for long night reading sessions.',
    price: 16000,
    category: 'Campus Essentials',
    hostel_location: 'Staff Quarters Gate',
    seller_id: 'demo-seller',
    created_at: new Date(Date.now() - 25200000).toISOString(),
    stock: 3,
    image_url: 'https://images.unsplash.com/photo-1580481072645-022f9a6d1270?w=600&auto=format&fit=crop&q=80',
  },
];

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
    <article className="group relative bg-white border border-[#eae3db] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <div className="relative aspect-square w-full overflow-hidden bg-[#f7f2ed] cursor-pointer" onClick={onOpen}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="absolute inset-0 m-auto text-[#d4c9bd]" size={36} />
          )}

          {unavailable && (
            <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              Sold Out
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            aria-label={saved ? 'Remove from saved' : 'Save item'}
            className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition-colors ${
              saved ? 'bg-[#f56616] text-white' : 'bg-white/90 text-[#312722] hover:bg-white'
            }`}
          >
            <Heart size={15} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="p-3 cursor-pointer" onClick={onOpen}>
          {product.category && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#f56616]">
              {product.category}
            </span>
          )}
          <h3 className="line-clamp-2 text-xs font-bold text-[#251d18] mt-0.5 leading-snug group-hover:text-[#f56616] transition-colors">
            {product.title}
          </h3>

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-sm font-black text-[#f56616]">₦{formatNaira(product.price)}</span>
            <span className="text-[10px] text-[#81756d] line-through">
              ₦{formatNaira(Math.round(product.price * 1.15))}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1 text-[11px] text-[#81756d]">
            <Star size={11} fill="#f5a623" className="text-[#f5a623]" />
            <span className="font-bold text-[#251d18]">4.8</span>
            <span className="text-[#a1958b]">(Verified)</span>
          </div>
        </div>
      </div>

      <div className="p-3 pt-0">
        {!unavailable && (
          quantity > 0 ? (
            <div className="flex items-center justify-between rounded-xl bg-[#fff2eb] px-2.5 py-1.5 text-[#f56616] font-bold text-xs">
              <button onClick={handleDecrease} className="p-1 hover:bg-[#ffe3d6] rounded-md transition-colors">
                <Minus size={14} />
              </button>
              <span className="font-mono">{quantity}</span>
              <button
                onClick={handleIncrease}
                disabled={quantity >= stockLimit(product)}
                className="p-1 hover:bg-[#ffe3d6] rounded-md transition-colors disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#f56616] hover:bg-[#e0550a] py-2 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer"
            >
              <ShoppingCart size={13} />
              <span>ADD TO CART</span>
            </button>
          )
        )}
      </div>
    </article>
  );
}

export default function JumiaLandingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { totalItems, addToCartOnce } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<Product | null>(null);
  const [user, setUser] = useState<any>(null);
  const [wishlistIds, setWishlistIds] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        const { data } = await supabase.from('wishlists').select('id, product_id').eq('user_id', currentUser.id);
        if (data) {
          setWishlistIds(Object.fromEntries(data.map((row) => [row.product_id, row.id])));
        }
      }
    };
    checkAuth();
  }, [supabase]);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('products')
          .select('*')
          .or('is_available.eq.true,is_available.is.null')
          .order('created_at', { ascending: false });

        if (search.trim()) {
          query = query.ilike('title', `%${search.trim()}%`);
        }

        const { data, error } = await query;

        if (error || !data || data.length === 0) {
          const matchedFallback = search.trim()
            ? DEFAULT_CAMPUS_PRODUCTS.filter((p) =>
                p.title.toLowerCase().includes(search.trim().toLowerCase())
              )
            : DEFAULT_CAMPUS_PRODUCTS;
          setProducts(matchedFallback);
        } else {
          setProducts(data as Product[]);
        }
      } catch (err) {
        console.error('Failed to fetch landing products:', err);
        setProducts(DEFAULT_CAMPUS_PRODUCTS);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchProducts, 250);
    return () => clearTimeout(timer);
  }, [search, supabase]);

  const categories = useMemo(() => {
    const raw = Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]));
    return ['All', 'Tech & Gadgets', 'Campus Essentials', 'Fashion', 'Books', 'Food & Snacks', ...raw.filter(c => !['Tech & Gadgets', 'Campus Essentials', 'Fashion', 'Books', 'Food & Snacks'].includes(c))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (category === 'All') return products;
    return products.filter((p) => p.category === category);
  }, [products, category]);

  const availableNow = useMemo(() => {
    return products.filter(isAvailable).slice(0, 6);
  }, [products]);

  const popularProducts = useMemo(() => {
    return [...products].sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a))).slice(0, 8);
  }, [products]);

  const featuredProducts = useMemo(() => {
    return products.slice(0, 6);
  }, [products]);

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
      addToCartOnce(selected);
      router.push('/buyer/cart?checkout=1');
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f3f6] text-[#251d18] font-sans pb-16">
      {/* Jumia Top Promo Banner */}
      <div className="bg-[#282828] text-white text-[11px] font-bold py-1.5 px-4 text-center flex items-center justify-center gap-3">
        <span className="bg-[#f56616] text-white px-2 py-0.5 rounded text-[10px] tracking-wide uppercase font-black">
          FUHSI ESCROW
        </span>
        <span className="hidden sm:inline">Shop campus deals securely — money released only upon pickup confirmation!</span>
        <span className="sm:hidden">100% Escrow Protected Campus Handover</span>
      </div>

      {/* Main Jumia Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#e1e3e8] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <span className="text-xl font-black tracking-tight text-[#282828]">
              FUHSI<span className="text-[#f56616]">MARKET</span>
            </span>
            <span className="bg-[#f56616] text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded uppercase">
              CAMPUS
            </span>
          </Link>

          {/* Search Bar */}
          <div className="flex-1 max-w-2xl relative hidden md:block">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 text-[#81756d]" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products, brands, campus essentials..."
                className="w-full bg-[#f1f3f6] border border-[#d1d5db] focus:border-[#f56616] rounded-xl pl-10 pr-24 py-2.5 text-xs text-[#251d18] outline-none transition-colors"
              />
              <button className="absolute right-1 bg-[#f56616] hover:bg-[#e0550a] text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer">
                SEARCH
              </button>
            </div>
          </div>

          {/* User Account & Cart links */}
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/buyer"
                className="flex items-center gap-2 hover:text-[#f56616] text-xs font-bold text-[#282828] py-1.5 px-3 rounded-xl border border-transparent hover:border-[#eae3db] transition-colors"
              >
                <User size={18} className="text-[#f56616]" />
                <span className="hidden sm:inline">My Account</span>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 text-xs font-bold text-[#282828] hover:text-[#f56616] px-3 py-1.5 rounded-xl border border-[#d1d5db] hover:border-[#f56616] transition-colors"
                >
                  <User size={16} />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/signup"
                  className="hidden sm:flex items-center gap-1 bg-[#f56616] hover:bg-[#e0550a] text-white text-xs font-bold px-3.5 py-1.5 rounded-xl transition-colors"
                >
                  Register
                </Link>
              </div>
            )}

            <button
              onClick={() => {
                if (!user) requireAuth();
                else router.push('/buyer/cart');
              }}
              className="relative flex items-center gap-2 text-xs font-bold text-[#282828] hover:text-[#f56616] py-1.5 px-3 rounded-xl border border-transparent hover:border-[#eae3db] transition-colors cursor-pointer"
            >
              <div className="relative">
                <ShoppingCart size={20} className="text-[#f56616]" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 bg-[#f56616] text-white text-[10px] font-black h-4 w-4 rounded-full flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline">Cart</span>
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="px-4 pb-3 md:hidden">
          <div className="relative flex items-center">
            <Search className="absolute left-3 text-[#81756d]" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, books, gadgets..."
              className="w-full bg-[#f1f3f6] border border-[#d1d5db] focus:border-[#f56616] rounded-xl pl-9 pr-16 py-2 text-xs text-[#251d18] outline-none"
            />
            <button className="absolute right-1 bg-[#f56616] text-white text-[11px] font-bold px-3 py-1 rounded-lg">
              Search
            </button>
          </div>
        </div>

        {/* Category Navigation Bar */}
        <div className="bg-[#282828] text-white overflow-x-auto [scrollbar-width:none]">
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 text-xs font-bold whitespace-nowrap py-2.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`transition-colors cursor-pointer ${
                  category === cat ? 'text-[#f56616] underline underline-offset-4 decoration-2' : 'text-neutral-300 hover:text-white'
                }`}
              >
                {cat === 'All' ? '⚡ ALL DEALS' : cat.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 pt-4 space-y-6">
        {/* Jumia Hero Promotional Slider Banner */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-col-span-3 md:col-span-3 bg-gradient-to-r from-[#f56616] via-[#ea580c] to-[#c2410c] rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col justify-between min-h-[220px]">
            <div className="relative z-10 max-w-lg space-y-2">
              <span className="inline-flex items-center gap-1 bg-black/30 backdrop-blur px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase">
                <Flame size={14} className="text-yellow-300 fill-yellow-300" /> Jumia-Style Super Deals
              </span>
              <h1 className="text-2xl sm:text-3xl font-black leading-tight">
                Verified Campus Marketplace for Students
              </h1>
              <p className="text-xs sm:text-sm text-white/90">
                Buy & sell gadgets, textbooks, hostellers&apos; appliances & snacks safely with escrow protection.
              </p>
            </div>

            <div className="relative z-10 mt-4 flex items-center gap-3">
              <button
                onClick={() => {
                  const el = document.getElementById('all-products-section');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="bg-white text-[#f56616] hover:bg-neutral-100 font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>SHOP NOW</span>
                <ArrowRight size={15} />
              </button>
              <Link
                href="/seller/subscribe"
                className="bg-black/40 hover:bg-black/60 text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-white/30 transition-colors"
              >
                Start Selling
              </Link>
            </div>

            {/* Decorative background shapes */}
            <div aria-hidden className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          </div>

          {/* Side Promo Card */}
          <div className="bg-white border border-[#eae3db] rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#f56616] text-xs font-black uppercase tracking-wider">
                <ShieldCheck size={18} />
                <span>Buyer Protection</span>
              </div>
              <h3 className="text-sm font-bold text-[#251d18]">100% Escrow Guarantee</h3>
              <p className="text-xs text-[#81756d] leading-relaxed">
                Payments stay safely in escrow until you verify your product upon delivery.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#f1f3f6]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#251d18]">
                <Clock size={16} className="text-[#f56616]" />
                <span>Fast Handover</span>
              </div>
              <p className="text-[11px] text-[#81756d]">Meet directly at hostel points or campus hotspots.</p>
            </div>
          </div>
        </section>

        {/* SECTION 1: AVAILABLE NOW (Flash Sale / Live Stock) */}
        <section className="bg-white border border-[#eae3db] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="bg-[#f56616] text-white px-4 py-2.5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-black text-sm tracking-wide uppercase">
              <Zap size={18} className="fill-yellow-300 text-yellow-300 animate-bounce" />
              <span>AVAILABLE NOW — LIVE CAMPUS STOCK</span>
            </div>
            <div className="text-xs font-mono font-bold flex items-center gap-1 bg-black/20 px-3 py-1 rounded-lg">
              <span>Ending soon:</span>
              <span className="text-yellow-300">02h : 45m : 12s</span>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse py-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-square bg-[#f1f3f6] rounded-xl" />
              ))}
            </div>
          ) : availableNow.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
              {availableNow.map((p) => (
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
          ) : (
            <p className="py-6 text-center text-xs text-[#81756d]">No items currently live.</p>
          )}
        </section>

        {/* SECTION 2: POPULAR PRODUCTS */}
        <section className="bg-white border border-[#eae3db] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#f1f3f6]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#fff2eb] text-[#f56616] rounded-lg">
                <Flame size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-[#251d18]">POPULAR PRODUCTS</h2>
                <p className="text-[11px] text-[#81756d]">Top student favorites & trending campus items</p>
              </div>
            </div>
            <button
              onClick={() => setCategory('All')}
              className="text-xs font-bold text-[#f56616] hover:underline flex items-center gap-0.5"
            >
              <span>See All</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 bg-[#f1f3f6] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
              {popularProducts.map((p) => (
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
          )}
        </section>

        {/* SECTION 3: FEATURED SECTION */}
        <section className="bg-white border border-[#eae3db] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#f1f3f6]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
                <Award size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-[#251d18]">FEATURED CAMPUS PICKS</h2>
                <p className="text-[11px] text-[#81756d]">Handpicked verified quality products</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 bg-[#f1f3f6] rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {featuredProducts.map((p) => (
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
          )}
        </section>

        {/* SECTION 4: PRODUCT LIST (FULL MARKETPLACE GRID) */}
        <section id="all-products-section" className="bg-white border border-[#eae3db] rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#f1f3f6]">
            <div>
              <h2 className="text-lg font-black text-[#251d18]">ALL PRODUCTS</h2>
              <p className="text-xs text-[#81756d]">Browse all available items across FUHSI campus</p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`shrink-0 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    category === cat
                      ? 'bg-[#f56616] text-white shadow-sm'
                      : 'bg-[#f1f3f6] text-[#5f534b] hover:bg-[#eae3db]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-60 bg-[#f1f3f6] rounded-2xl" />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((p) => (
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
          ) : (
            <div className="py-12 text-center space-y-2">
              <Store size={36} className="mx-auto text-[#d4c9bd]" />
              <p className="text-sm font-bold text-[#251d18]">No products found</p>
              <p className="text-xs text-[#81756d]">Try searching for something else or clearing filters.</p>
            </div>
          )}
        </section>
      </main>

      {/* PRODUCT DETAIL MODAL */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-[#f7f2ed]">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.title} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="absolute inset-0 m-auto text-[#d4c9bd]" size={48} />
              )}
              <button
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-[#251d18] shadow-md hover:bg-neutral-100 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {selected.category && (
                <span className="text-xs font-black uppercase text-[#f56616] tracking-wider">
                  {selected.category}
                </span>
              )}

              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-black text-[#251d18]">{selected.title}</h2>
                <span className="text-xl font-black text-[#f56616] shrink-0">₦{formatNaira(selected.price)}</span>
              </div>

              <p className="text-xs text-[#81756d] leading-relaxed">
                {selected.description || 'No additional details provided by the seller.'}
              </p>

              {selected.hostel_location && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#5f534b] pt-1">
                  <MapPin size={15} className="text-[#f56616]" />
                  <span>Hostel / Location: {selected.hostel_location}</span>
                </div>
              )}

              <div className="flex items-center gap-2 p-3 bg-[#fff2eb] text-[#f56616] rounded-xl text-xs font-bold">
                <ShieldCheck size={18} className="shrink-0" />
                <span>Protected by Escrow: Money is released only when you confirm receipt.</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              {!user ? (
                <button
                  onClick={requireAuth}
                  className="w-full flex items-center justify-center gap-2 bg-[#f56616] hover:bg-[#e0550a] text-white font-bold text-xs py-3.5 rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  <Lock size={16} />
                  <span>Sign In to Buy or Add to Cart</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      addToCartOnce(selected);
                      setSelected(null);
                    }}
                    className="flex-1 bg-[#f56616] hover:bg-[#e0550a] text-white font-bold text-xs py-3.5 rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    ADD TO CART
                  </button>
                  <button
                    onClick={handleBuyNowModal}
                    className="flex-1 bg-[#282828] hover:bg-black text-white font-bold text-xs py-3.5 rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    BUY NOW
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
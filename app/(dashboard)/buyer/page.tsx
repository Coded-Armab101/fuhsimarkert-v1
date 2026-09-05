'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase';
import { useCart } from '@/context/CartContext';
import { formatNaira } from '@/utils/money';
import DeliveryAnnouncement from './DeliveryAnnouncement';
import {
  Search,
  ShoppingBag,
  Loader2,
  Image as ImageIcon,
  Plus,
  Minus,
  X,
  ShieldCheck,
  MapPin,
  Heart,
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

const inStock = (p: Product | null) => {
  if (!p) return false;
  // NULL or undefined stock = untracked/unlimited → always available.
  if (p.stock === null || p.stock === undefined) return true;
  return p.stock > 0;
};

const stockCount = (p: Product | null) =>
  p?.stock === null || p?.stock === undefined ? Infinity : Number(p?.stock) || 0;

export default function BuyerDashboardPage() {
  const supabase = createClient();
  const { addToCart, decreaseQuantity, getQuantity, totalItems } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Record<string, string>>({}); // productId -> wishlist row id
  const [userId, setUserId] = useState<string | null>(null);

  // Load which products this buyer has already wishlisted.
  useEffect(() => {
    const loadWishlist = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('wishlists')
        .select('id, product_id')
        .eq('user_id', user.id);
      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) map[row.product_id] = row.id;
        setWishlistIds(map);
      }
    };
    loadWishlist();
  }, [supabase]);

  const toggleWishlist = async (productId: string) => {
    const wishId = wishlistIds[productId];
    if (wishId) {
      const { error } = await supabase.from('wishlists').delete().eq('id', wishId);
      if (!error) {
        setWishlistIds((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }
    } else {
      if (!userId) return;
      const { data, error } = await supabase
        .from('wishlists')
        .insert({ user_id: userId, product_id: productId })
        .select('id, product_id')
        .maybeSingle();
      if (!error && data) {
        setWishlistIds((prev) => ({ ...prev, [data.product_id]: data.id }));
      }
    }
  };

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('products')
          .select('*')
          .eq('is_available', true)
          .order('created_at', { ascending: false });

        if (searchQuery.trim()) {
          query = query.ilike('title', `%${searchQuery}%`);
        }

        const { data, error } = await query;
        if (!error) setProducts((data as Product[]) || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => fetchProducts(), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, supabase]);

  // Live quantity of the selected product, derived from the cart on each render.
  const selectedQty = selected ? getQuantity(selected.id) : 0;

  const openDetail = (product: Product) => setSelected(product);

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6 pb-28">
      {/* HEADER & SEARCH */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Campus Market</h1>
          <p className="text-xs text-neutral-400">
            Explore items listed by FUHSI campus vendors
          </p>
        </div>

        {/* CART LINK QUICK COUNTER */}
        <Link
          href="/buyer/cart"
          className="relative bg-neutral-900 border border-neutral-800 p-3 rounded-2xl text-neutral-300 hover:text-white hover:border-neutral-700 transition-all"
        >
          <ShoppingBag size={20} />
          {totalItems > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white font-bold font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </Link>
      </div>

      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
          size={18}
        />
        <input
          type="text"
          placeholder="Search items by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl pl-12 pr-4 py-3.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600 shadow-xl"
        />
      </div>

      <DeliveryAnnouncement />

      {/* PRODUCTS DISPLAY */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-2">
          <Loader2 className="animate-spin text-red-500" size={24} />
          <span>Fetching market listings...</span>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-12 text-center space-y-3">
          <ShoppingBag size={40} className="mx-auto text-neutral-700" />
          <h3 className="text-sm font-bold text-white">No products found</h3>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((item) => {
            const qty = getQuantity(item.id);
            const inCart = qty > 0;
            const maxQty = stockCount(item);

            return (
              <div
                key={item.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 flex flex-col justify-between gap-3 hover:border-neutral-700 transition-all relative"
              >
                {/* Wishlist toggle (overlays the image, kept out of the card-body button) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWishlist(item.id);
                  }}
                  aria-label={wishlistIds[item.id] ? 'Remove from saved' : 'Save to saved'}
                  className={`absolute top-4 right-4 z-20 p-2 rounded-full backdrop-blur border transition-all cursor-pointer ${
                    wishlistIds[item.id]
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-red-400'
                  }`}
                >
                  <Heart
                    size={16}
                    fill={wishlistIds[item.id] ? 'currentColor' : 'none'}
                  />
                </button>

                {/* Click anywhere on the card body opens the detail view */}
                <button
                  onClick={() => openDetail(item)}
                  className="text-left space-y-2 cursor-pointer"
                >
                  <div className="w-full h-36 bg-neutral-900 rounded-xl overflow-hidden relative">
                    {!inStock(item) && (
                      <span className="absolute top-2 left-2 z-10 bg-red-600 text-white text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded">
                        Out of Stock
                      </span>
                    )}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-700">
                        <ImageIcon size={28} />
                      </div>
                    )}
                  </div>

                  <h3 className="font-bold text-white text-xs line-clamp-1">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400 line-clamp-2">
                    {item.description || 'Tap to view details.'}
                  </p>
                </button>

                <div className="pt-2 border-t border-neutral-900 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="block text-xs font-mono font-black text-red-500">
                      ₦{formatNaira(item.price)}
                    </span>
                    {item.stock !== null && item.stock !== undefined && item.stock > 0 && (
                      <span className="block text-[9px] font-mono text-emerald-500">
                        {item.stock} in stock
                      </span>
                    )}
                  </div>

                  {!inStock(item) ? (
                    <span className="text-[9px] font-mono uppercase text-neutral-600 px-2">
                      Sold out
                    </span>
                  ) : inCart ? (
                    <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-1 py-1">
                      <button
                        onClick={() => decreaseQuantity(item.id)}
                        className="p-1.5 rounded-lg text-neutral-300 hover:text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
                        aria-label={`Decrease ${item.title}`}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-xs font-mono font-bold text-white w-4 text-center">
                        {qty}
                      </span>
                      <button
                        onClick={() => addToCart(item)}
                        disabled={qty >= maxQty}
                        className="p-1.5 rounded-lg text-neutral-300 hover:text-red-400 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                        aria-label={`Increase ${item.title}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(item)}
                      disabled={maxQty < 1}
                      className="p-2 rounded-xl bg-neutral-900 hover:bg-red-600 text-neutral-300 hover:text-white border border-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                      aria-label={`Add ${item.title} to cart`}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PRODUCT DETAIL MODAL */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 transition-all cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="w-full h-56 bg-neutral-900 rounded-2xl overflow-hidden relative">
              {!inStock(selected) && (
                <span className="absolute top-3 left-3 z-10 bg-red-600 text-white text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded">
                  Out of Stock
                </span>
              )}
              <button
                onClick={() => toggleWishlist(selected.id)}
                aria-label="Toggle saved"
                className={`absolute top-3 right-3 z-10 p-2.5 rounded-full backdrop-blur border transition-all cursor-pointer ${
                  wishlistIds[selected.id]
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-red-400'
                }`}
              >
                <Heart
                  size={18}
                  fill={wishlistIds[selected.id] ? 'currentColor' : 'none'}
                />
              </button>
              {selected.image_url ? (
                <img
                  src={selected.image_url}
                  alt={selected.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-700">
                  <ImageIcon size={40} />
                </div>
              )}
            </div>

            {selected.category && (
              <span className="inline-block text-[10px] font-mono font-bold text-red-400 bg-red-950/40 px-2.5 py-1 rounded border border-red-800/60">
                {selected.category}
              </span>
            )}

            <div className="space-y-1">
              <h2 className="text-lg font-black text-white">{selected.title}</h2>
              <p className="text-xl font-mono font-black text-red-500">
                ₦{formatNaira(selected.price)}
              </p>
              {selected.stock !== null && selected.stock !== undefined && selected.stock > 0 && (
                <p className="text-[11px] font-mono text-emerald-500">
                  {selected.stock} in stock
                </p>
              )}
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              {selected.description || 'No description provided by the seller.'}
            </p>

            {selected.hostel_location && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400 bg-neutral-900/60 border border-neutral-800 p-3 rounded-xl">
                <MapPin size={13} className="text-red-500 shrink-0" />
                <span>{selected.hostel_location}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500 bg-neutral-900/60 border border-neutral-800 p-3 rounded-xl">
              <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
              <span>
                Protected by FUHSI Escrow. Funds are held until you confirm
                delivery.
              </span>
            </div>

            {/* ADD TO CART CONTROLS */}
            {!inStock(selected) ? (
              <div className="p-3 bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-mono text-center rounded-xl">
                This item is currently out of stock.
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2">
                  <button
                    onClick={() => decreaseQuantity(selected.id)}
                    disabled={selectedQty === 0}
                    className="p-2 rounded-lg text-neutral-300 hover:text-red-400 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-sm font-mono font-bold text-white w-6 text-center">
                    {selectedQty}
                  </span>
                  <button
                    onClick={() => addToCart(selected)}
                    disabled={selectedQty >= stockCount(selected)}
                    className="p-2 rounded-lg text-neutral-300 hover:text-red-400 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                    aria-label="Increase quantity"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <button
                  onClick={() => addToCart(selected)}
                  disabled={selectedQty >= stockCount(selected)}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 rounded-2xl transition-all cursor-pointer shadow-lg shadow-red-950/50 disabled:opacity-50"
                >
                  {selectedQty > 0 ? 'Update Cart' : 'Add to Cart'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

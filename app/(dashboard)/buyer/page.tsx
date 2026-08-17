'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase';
import { Search, ShoppingBag, Loader2, Image as ImageIcon, SlidersHorizontal } from 'lucide-react';

const CATEGORIES = [
  'All',
  'General',
  'Textbooks & Academics',
  'Electronics & Gadgets',
  'Fashion & Apparel',
  'Hostel & Room Essentials',
  'Food & Snacks',
  'Services',
];

export default function BuyerMarketplacePage() {
  const supabase = createClient();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Fetch products from database
  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey(full_name)
        `)
        .eq('is_available', true)
        .order('created_at', { ascending: false });

      // Apply category filter
      if (selectedCategory !== 'All') {
        query = query.eq('category', selectedCategory);
      }

      // Apply search query
      if (searchQuery.trim() !== '') {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching market products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 300); // 300ms debounce for typing

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6 pb-28">
      {/* HEADER & SEARCH BAR */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">Campus Market</h1>
          <p className="text-xs text-neutral-400">Discover items listed by verified FUHSI student sellers</p>
        </div>

        {/* SEARCH INPUT */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
          <input
            type="text"
            placeholder="Search textbooks, gadgets, clothes, room items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-2xl pl-12 pr-4 py-3.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600 shadow-xl transition-all"
          />
        </div>

        {/* CATEGORY FILTER PILLS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono whitespace-nowrap cursor-pointer transition-all ${
                selectedCategory === cat
                  ? 'bg-red-600 text-white font-bold shadow-lg shadow-red-950/50'
                  : 'bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* PRODUCT GRID */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-2">
          <Loader2 className="animate-spin text-red-500" size={24} />
          <span>Searching campus marketplace...</span>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-12 text-center space-y-3">
          <ShoppingBag size={40} className="mx-auto text-neutral-700" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">No products found</h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Try tweaking your search term or selecting a different category.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((item) => (
            <Link
              key={item.id}
              href={`/market/product/${item.id}`}
              className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 flex flex-col justify-between gap-3 group hover:border-neutral-700 transition-all cursor-pointer"
            >
              <div className="space-y-2">
                <div className="w-full h-36 bg-neutral-900 rounded-xl overflow-hidden relative">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-700">
                      <ImageIcon size={28} />
                    </div>
                  )}
                  <span className="absolute top-2 left-2 bg-neutral-950/80 backdrop-blur-md text-[10px] text-neutral-300 px-2 py-0.5 rounded-md font-mono border border-neutral-800">
                    {item.category || 'General'}
                  </span>
                </div>

                <h3 className="font-bold text-white text-xs line-clamp-1 group-hover:text-red-400 transition-colors">
                  {item.title}
                </h3>
                <p className="text-[11px] text-neutral-400 line-clamp-2">
                  {item.description || 'No description provided.'}
                </p>
              </div>

              <div className="pt-2 border-t border-neutral-900 flex items-center justify-between">
                <span className="text-xs font-mono font-black text-red-500">
                  ₦{Number(item.price).toLocaleString()}
                </span>
                <span className="text-[10px] text-neutral-500 truncate max-w-[80px]">
                  {item.seller?.full_name || 'Vendor'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
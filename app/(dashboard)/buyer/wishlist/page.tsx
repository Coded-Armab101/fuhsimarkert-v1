'use client';

import React, { useEffect, useState } from 'react';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { createClient } from '@/utils/supabase';

export default function WishlistPage() {
  const supabase = createClient();
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlistItems = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);

    const { data, error } = await supabase
      .from('wishlists')
      .select(`
        id,
        products (
          id,
          title,
          price,
          description
        )
      `)
      .eq('user_id', user.id);

    if (!error && data) setWishlistItems(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchWishlistItems();
  }, []);

  const handleRemoveWish = async (wishId: string) => {
    const { error } = await supabase
      .from('wishlists')
      .delete()
      .eq('id', wishId);

    if (!error) {
      setWishlistItems(prev => prev.filter(item => item.id !== wishId));
    }
  };

  const handleMoveToCart = async (wishId: string, productId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Move to cart table
    const { error: cartErr } = await supabase
      .from('carts')
      .insert([{ user_id: user.id, product_id: productId }]);

    if (!cartErr || cartErr.code === '23505') {
      // 2. Clear out of wishlist table on success
      await handleRemoveWish(wishId);
      alert('Shifted completely into active shopping configurations!');
    }
  };

  if (loading) return <div className="p-6 text-xs font-mono text-neutral-500">Querying secure wishlists...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <Heart className="text-red-500" size={22} /> Your Saved Watchlist
        </h1>
        <p className="text-xs text-neutral-400 mt-1">Monitored student items awaiting escrow processing authorization details.</p>
      </div>

      {wishlistItems.length === 0 ? (
        <div className="p-12 border border-neutral-800 bg-neutral-950 rounded-2xl text-center text-xs text-neutral-500 font-mono">
          Your saved metrics track zero assets currently.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wishlistItems.map((item) => {
            const product = item.products;
            if (!product) return null;
            return (
              <div key={item.id} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between shadow-md">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-sm font-bold text-neutral-200 line-clamp-1">{product.title}</h3>
                    <span className="text-emerald-400 font-mono font-black text-xs">
                      ₦{(product.price / 100).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1">{product.description}</p>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-4 pt-2 border-t border-neutral-900">
                  <button
                    onClick={() => handleMoveToCart(item.id, product.id)}
                    className="col-span-3 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ShoppingCart size={13} />
                    <span>Move to Cart</span>
                  </button>

                  <button
                    onClick={() => handleRemoveWish(item.id)}
                    className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-900/40 text-neutral-600 hover:text-red-400 rounded-xl flex items-center justify-center cursor-pointer transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
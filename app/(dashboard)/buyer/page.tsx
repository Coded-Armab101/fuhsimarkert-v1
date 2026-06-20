'use client';

import React, { useEffect, useState } from 'react';
import { ShoppingBag, ShoppingCart, Heart, RefreshCw, MapPin } from 'lucide-react';
import { createClient } from '@/utils/supabase';

export default function ShopFeedPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchActiveProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_sold', false)
      .order('created_at', { ascending: false });

    if (!error && data) setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchActiveProducts();
  }, []);

 const handleAddToCart = async (productId: string) => {
  setActionId(productId); // Turn on loading spinner/state for this explicit button
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Session expired. Please log back into FUHSI Market.");
    setActionId(null);
    return;
  }

  // Insert a clean row into the carts table
  const { error } = await supabase
    .from('carts')
    .insert([
      { 
        user_id: user.id,      
        product_id: productId  
      }
    ]);

  setActionId(null); // Turn off loading state

  if (!error) {
    alert('Object locked into your secure cart allocation layout!');
  } else if (error.code === '23505') {
    // Catching the unique database rule we set up in the SQL editor
    alert('This product is already registered inside your cart manifest.');
  } else {
    alert('Database network rejection: Could not update cart parameters.');
  }
};

  const handleAddToWishlist = async (productId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('wishlists')
      .insert([{ user_id: user.id, product_id: productId }]);

    if (!error) alert('Locked into your wishlist metadata!');
    else if (error.code === '23505') alert('Item is already in your wishlist.');
  };

  if (loading) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-500 gap-2">
        <RefreshCw className="animate-spin text-red-500" size={18} />
        <span>Parsing live campus marketplace feeds...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <ShoppingBag className="text-red-500" size={22} />
          FUHSI Active Marketplace
        </h1>
        <p className="text-xs text-neutral-400 mt-1">Real-time P2P listings directly from inside the university hostels.</p>
      </div>

      {products.length === 0 ? (
        <div className="p-12 border border-neutral-800 bg-neutral-950 rounded-2xl text-center text-xs text-neutral-500 font-mono">
          No products currently active on the market wire.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
              <div>
                <div className="w-full h-40 bg-neutral-900 border border-neutral-800/60 rounded-xl overflow-hidden mb-3 relative flex items-center justify-center text-neutral-700 text-xs font-mono">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.title} className="object-cover w-full h-full" />
                  ) : (
                    <span>No Product Matrix Render</span>
                  )}
                </div>

                <div className="flex justify-between items-start gap-2">
                  <h3 className="text-sm font-bold text-neutral-200 line-clamp-1">{product.title}</h3>
                  <span className="text-emerald-400 font-mono font-black text-xs">
                    ₦{(product.price / 100).toLocaleString()}
                  </span>
                </div>

                <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1">{product.description}</p>
                
                <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-mono mt-2 bg-neutral-900/60 w-fit px-2 py-0.5 rounded border border-neutral-800/40">
                  <MapPin size={10} className="text-red-500" />
                  <span>{product.hostel_location}</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mt-4 pt-2 border-t border-neutral-900">
                <button
                  onClick={() => handleAddToCart(product.id)}
                  disabled={actionId === product.id}
                  className="col-span-3 bg-red-700 hover:bg-red-600 disabled:bg-neutral-900 disabled:text-neutral-600 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <ShoppingCart size={13} />
                  <span>{actionId === product.id ? 'Adding...' : 'Secure Cart'}</span>
                </button>

                <button
                  onClick={() => handleAddToWishlist(product.id)}
                  className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-red-400 rounded-xl flex items-center justify-center cursor-pointer transition-all"
                >
                  <Heart size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
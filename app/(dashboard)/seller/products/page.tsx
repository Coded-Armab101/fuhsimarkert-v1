'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { Package, Plus, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';

export default function SellerProductsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login?redirect=/seller/products');
          return;
        }

        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        if (data) setProducts(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchProducts();
  }, [router, supabase]);

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } else {
      alert('Failed to delete product.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-xs font-mono text-neutral-400 gap-2">
        <Loader2 className="animate-spin text-red-500" size={20} />
        <span>Loading products...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex justify-between items-center bg-neutral-950 border border-neutral-800 p-6 rounded-3xl">
        <div>
          <h1 className="text-xl font-bold text-white">Product Inventory</h1>
          <p className="text-xs text-neutral-400">Manage your campus market listings</p>
        </div>
        <button
          onClick={() => router.push('/seller/products/new')}
          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Item</span>
        </button>
      </div>

      {products.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-12 text-center space-y-3">
          <Package size={36} className="mx-auto text-neutral-600" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">No products listed yet</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Start selling to FUHSI students by publishing your first item.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((item) => (
            <div key={item.id} className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between gap-4">
              <div className="space-y-2">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-full h-40 object-cover rounded-xl" />
                ) : (
                  <div className="w-full h-40 bg-neutral-900 rounded-xl flex items-center justify-center text-neutral-700">
                    <ImageIcon size={28} />
                  </div>
                )}
                <h4 className="font-bold text-white text-sm line-clamp-1">{item.title}</h4>
                <p className="text-xs text-neutral-400 line-clamp-2">{item.description}</p>
                <div className="text-red-500 font-bold font-mono text-sm">₦{Number(item.price).toLocaleString()}</div>
              </div>

              <button
                onClick={() => handleDeleteProduct(item.id)}
                className="w-full bg-neutral-900 hover:bg-red-950 text-neutral-300 hover:text-red-400 border border-neutral-800 hover:border-red-800 font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Delete Listing</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
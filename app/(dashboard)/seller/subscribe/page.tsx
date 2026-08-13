'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { 
  Store, 
  PackagePlus, 
  ShoppingBag, 
  TrendingUp, 
  Loader2, 
  LayoutDashboard, 
  Package, 
  Receipt, 
  Settings, 
  Plus,
  Trash2
} from 'lucide-react';

export default function SellerDashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'settings'>('overview');

  useEffect(() => {
    const fetchSellerData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          router.push('/login?redirect=/seller/dashboard');
          return;
        }

        // Fetch seller profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        setProfile(profileData);

        if (!profileData || profileData.is_seller !== true) {
          router.push('/seller/subscribe');
          return;
        }

        // Fetch seller's products
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        if (productsData) setProducts(productsData);

        // Fetch seller's escrow orders
        const { data: ordersData } = await supabase
          .from('orders')
          .select('*')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        if (ordersData) setOrders(ordersData);

        setLoading(false);
      } catch (err) {
        console.error('Dashboard data load failed:', err);
        setLoading(false);
      }
    };

    fetchSellerData();
  }, [router, supabase]);

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } else {
      alert('Failed to delete product. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-3">
        <Loader2 className="animate-spin text-red-500" size={24} />
        <span>Loading Vendor Studio...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-950 border border-neutral-800 p-6 sm:p-8 rounded-3xl shadow-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono font-bold">
            <Store size={14} /> Active Vendor Studio
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Welcome, {profile?.full_name || 'Vendor'}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Manage your store listings, track orders, and view payout status.
          </p>
        </div>

        <button
          onClick={() => router.push('/seller/products/new')}
          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 cursor-pointer self-start md:self-auto"
        >
          <PackagePlus size={16} />
          <span>Add New Product</span>
        </button>
      </div>

      {/* ACTIVE TAB CONTENT DISPLAY AREA */}
      <div className="min-h-[350px]">
        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-neutral-400 text-xs">
                  <span>Total Revenue</span>
                  <TrendingUp size={16} className="text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-white">₦0.00</div>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-neutral-400 text-xs">
                  <span>Active Products</span>
                  <ShoppingBag size={16} className="text-blue-500" />
                </div>
                <div className="text-2xl font-black text-white">{products.length}</div>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-neutral-400 text-xs">
                  <span>Subscription Status</span>
                  <Store size={16} className="text-emerald-500" />
                </div>
                <div className="text-sm font-bold text-emerald-400 uppercase">ACTIVE</div>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
              <h2 className="text-lg font-bold text-white">Your Campus Storefront</h2>
              <p className="text-xs text-neutral-400">
                {products.length > 0
                  ? `You have ${products.length} product(s) currently listed on FUHSI Market.`
                  : 'You have no active product listings on FUHSI Market yet. Click "Add New Product" above to create your first listing.'}
              </p>
            </div>
          </div>
        )}

        {/* 2. PRODUCTS TAB */}
        {activeTab === 'products' && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Product Inventory</h2>
                <p className="text-xs text-neutral-400">Manage your items listed on FUHSI Market</p>
              </div>
              <button
                onClick={() => router.push('/seller/products/new')}
                className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>Add Item</span>
              </button>
            </div>

            {products.length === 0 ? (
              <div className="border border-neutral-900 rounded-2xl p-8 text-center space-y-3">
                <Package size={32} className="mx-auto text-neutral-600" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">No products listed yet</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                    Start selling to FUHSI students by adding your first product.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((item) => (
                  <div key={item.id} className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      {item.image_url && (
                        <img src={item.image_url} alt={item.title} className="w-full h-36 object-cover rounded-xl" />
                      )}
                      <h4 className="font-bold text-white text-sm line-clamp-1">{item.title}</h4>
                      <p className="text-xs text-neutral-400 line-clamp-2">{item.description}</p>
                      <div className="text-red-400 font-bold font-mono text-sm">₦{Number(item.price).toLocaleString()}</div>
                    </div>

                    <button
                      onClick={() => handleDeleteProduct(item.id)}
                      className="w-full bg-neutral-800 hover:bg-red-950 text-neutral-300 hover:text-red-400 border border-neutral-700 hover:border-red-800 font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Delete Listing</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">Escrow Orders</h2>
              <p className="text-xs text-neutral-400">Track student purchases & payouts</p>
            </div>

            <div className="border border-neutral-900 rounded-2xl p-8 text-center space-y-3">
              <Receipt size={32} className="mx-auto text-neutral-600" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">No incoming orders yet</h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  When a student purchases one of your items via Escrow, it will show up here.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4. SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">Payout Settings</h2>
              <p className="text-xs text-neutral-400">Your bank account details for receiving sale settlements</p>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl space-y-3">
                <span className="text-neutral-400 font-bold block">Linked Bank Account</span>
                <div className="space-y-1 text-white">
                  <div><span className="text-neutral-500">Bank:</span> {profile?.bank_name || 'Not set'}</div>
                  <div><span className="text-neutral-500">Account Number:</span> {profile?.account_number || 'Not set'}</div>
                  <div><span className="text-neutral-500">Account Name:</span> {profile?.account_name || profile?.full_name || 'Not set'}</div>
                </div>
                <button
                  onClick={() => router.push('/profile')}
                  className="mt-2 text-red-400 hover:text-red-300 font-bold text-xs underline cursor-pointer"
                >
                  Update Bank Details in Profile →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM TAB NAVIGATION BAR */}
      <div className="bg-neutral-950 border border-neutral-800 p-2 rounded-2xl shadow-2xl flex items-center justify-between gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-red-600 text-white shadow-md shadow-red-950/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <LayoutDashboard size={16} />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-red-600 text-white shadow-md shadow-red-950/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Package size={16} />
          <span>Products ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-red-600 text-white shadow-md shadow-red-950/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Receipt size={16} />
          <span>Orders ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'settings'
              ? 'bg-red-600 text-white shadow-md shadow-red-950/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
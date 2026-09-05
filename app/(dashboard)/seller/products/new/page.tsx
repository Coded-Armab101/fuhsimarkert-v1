'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { nairaToKobo } from '@/utils/money';
import { uploadProductImage, getSellerStorageUsed } from '@/utils/upload';
import { PackagePlus, Loader2, ArrowLeft, UploadCloud, Database } from 'lucide-react';

const CATEGORIES = [
  'General',
  'Textbooks & Academics',
  'Electronics & Gadgets',
  'Fashion & Apparel',
  'Hostel & Room Essentials',
  'Food & Snacks',
  'Services',
];

export default function AddProductPage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [stock, setStock] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageQuota, setStorageQuota] = useState<number | null>(null);
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('storage_quota')
        .eq('id', user.id)
        .maybeSingle();
      if (profile && profile.storage_quota != null) {
        setStorageQuota(Number(profile.storage_quota));
      }
      setStorageUsed(await getSellerStorageUsed(supabase, user.id));
    })();
  }, [supabase]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    setError(null);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Product title is required.');
      return;
    }

    // products.price is stored in kobo. The form collects naira.
    const priceKobo = nairaToKobo(price);
    if (priceKobo === null) {
      setError('Enter a price greater than ₦0.');
      return;
    }

    // stock is optional; blank means untracked (unlimited).
    let stockValue: number | null = null;
    if (stock.trim() !== '') {
      const parsed = parseInt(stock.trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Stock must be 0 or a positive whole number.');
        return;
      }
      stockValue = parsed;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?redirect=/seller/products/new');
        return;
      }

      // Upload the image first (if any) so we can persist our own URL.
      const upload = await uploadProductImage(supabase, user.id, imageFile, storageQuota);
      if (!upload.ok) {
        setError(upload.error);
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase.from('products').insert([
        {
          seller_id: user.id,
          title: title.trim(),
          price: priceKobo,
          category,
          description: description.trim(),
          image_url: upload.url || null,
          stock: stockValue,
          is_available: true,
        },
      ]);

      if (insertError) throw insertError;

      router.push('/seller/products');
    } catch (err) {
      // Log the real error for us; show the user something that does not leak
      // column names, constraint names or RLS policy details.
      console.error('Failed to publish product:', err);
      setError('Could not publish this product. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-950/50 border border-red-800/50 rounded-2xl text-red-500">
            <PackagePlus size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">List New Product</h1>
            <p className="text-xs text-neutral-400">Post an item for FUHSI students</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-neutral-300">Product Title *</label>
            <input
              type="text"
              placeholder="e.g. Physiology Textbook (3rd Edition)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-300">Price (₦) *</label>
              <input
                type="number"
                placeholder="e.g. 5000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-red-600"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-neutral-300">Stock</label>
            <input
              type="number"
              min="0"
              placeholder="Leave blank for unlimited"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-neutral-300">Description</label>
            <textarea
              placeholder="Describe item condition, pickup location on campus..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600 resize-none h-28"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-neutral-300">Product Image (JPG/PNG/WEBP/GIF, max 2MB)</label>

            {storageQuota !== null && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400 bg-neutral-900/60 border border-neutral-800 p-3 rounded-xl">
                <Database size={13} className="text-red-500 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span>Storage used: {(storageUsed / 1024 / 1024).toFixed(2)}MB / {(storageQuota / 1024 / 1024).toFixed(0)}MB</span>
                    <span>{((storageUsed / storageQuota) * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(storageUsed / storageQuota) > 0.9 ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (storageUsed / storageQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {previewUrl && (
              <img src={previewUrl} alt="Preview" className="w-full h-44 object-cover rounded-xl border border-neutral-800" />
            )}
            <label className="flex items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-red-600 bg-neutral-900 rounded-xl px-4 py-6 text-xs text-neutral-400 cursor-pointer transition-all">
              <UploadCloud size={16} />
              <span>{imageFile ? imageFile.name : 'Choose an image file'}</span>
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
            <p className="text-[10px] text-neutral-500 font-mono">
              Tip: compress your photos (many phone cameras are {'>'}2MB) — you have a set storage allowance per seller.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="text-[11px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2.5"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-red-950/50 mt-4"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <PackagePlus size={16} />}
            <span>{submitting ? 'Publishing...' : 'Publish Product'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
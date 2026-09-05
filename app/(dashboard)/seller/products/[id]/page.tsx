'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { nairaToKobo, koboToNaira } from '@/utils/money';
import { uploadProductImage, getSellerStorageUsed } from '@/utils/upload';
import { Package, Loader2, ArrowLeft, UploadCloud, Database } from 'lucide-react';

const CATEGORIES = [
  'General',
  'Textbooks & Academics',
  'Electronics & Gadgets',
  'Fashion & Apparel',
  'Hostel & Room Essentials',
  'Food & Snacks',
  'Services',
];

export default function EditProductPage() {
  const router = useRouter();
  const supabase = createClient();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [stock, setStock] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [storageQuota, setStorageQuota] = useState<number | null>(null);
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login?redirect=/seller/products');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('storage_quota')
          .eq('id', user.id)
          .maybeSingle();
        if (profile && profile.storage_quota != null) {
          setStorageQuota(Number(profile.storage_quota));
        }
        setStorageUsed(await getSellerStorageUsed(supabase, user.id));

        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .eq('seller_id', user.id)
          .maybeSingle();

        if (error || !data) {
          setNotFound(true);
          return;
        }

        setTitle(data.title || '');
        setPrice(String(koboToNaira(Number(data.price))));
        setCategory(data.category || 'General');
        setDescription(data.description || '');
        setStock(data.stock !== null && data.stock !== undefined ? String(data.stock) : '');
        setExistingImage(data.image_url || null);
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [supabase, router, id]);

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

    const priceKobo = nairaToKobo(price);
    if (priceKobo === null) {
      setError('Enter a price greater than ₦0.');
      return;
    }

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
        router.push('/login?redirect=/seller/products');
        return;
      }

      // If a new image was chosen, upload it; otherwise keep the existing one.
      let imageUrl = existingImage;
      if (imageFile) {
        const upload = await uploadProductImage(supabase, user.id, imageFile, storageQuota);
        if (!upload.ok) {
          setError(upload.error);
          setSubmitting(false);
          return;
        }
        imageUrl = upload.url || existingImage;
      }

      const { error: updateError } = await supabase
        .from('products')
        .update({
          title: title.trim(),
          price: priceKobo,
          category,
          description: description.trim(),
          image_url: imageUrl,
          stock: stockValue,
        })
        .eq('id', id)
        .eq('seller_id', user.id);

      if (updateError) throw updateError;
      router.push('/seller/products');
    } catch (err) {
      console.error('Failed to update product:', err);
      setError('Could not save changes. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-xs font-mono text-neutral-400 gap-2">
        <Loader2 className="animate-spin text-red-500" size={20} />
        <span>Loading product...</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-xs font-mono text-neutral-400 gap-3">
        <span>Product not found.</span>
        <button
          onClick={() => router.push('/seller/products')}
          className="text-red-400 underline cursor-pointer"
        >
          Back to products
        </button>
      </div>
    );
  }

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
            <Package size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Edit Product</h1>
            <p className="text-xs text-neutral-400">Update your listing details</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-neutral-300">Product Title *</label>
            <input
              type="text"
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
            {(previewUrl || existingImage) && (
              <img
                src={previewUrl || existingImage || ''}
                alt="Preview"
                className="w-full h-44 object-cover rounded-xl border border-neutral-800"
              />
            )}
            <label className="flex items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-red-600 bg-neutral-900 rounded-xl px-4 py-6 text-xs text-neutral-400 cursor-pointer transition-all">
              <UploadCloud size={16} />
              <span>{imageFile ? imageFile.name : 'Choose a new image (optional)'}</span>
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
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
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <Package size={16} />}
            <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
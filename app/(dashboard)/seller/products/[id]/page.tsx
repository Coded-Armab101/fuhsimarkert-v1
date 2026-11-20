'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { nairaToKobo, koboToNaira } from '@/utils/money';
import { productImageFileError, revokePreviewUrl, safeImageSrc } from '@/utils/safeImage';
import { Package, Loader2, ArrowLeft, UploadCloud, Database } from 'lucide-react';
import { PRODUCT_CATEGORIES } from '@/utils/categories';
import { PRODUCT_UNITS } from '@/utils/units';
import { optionList } from '@/utils/variants';
import OptionTagInput from '@/components/OptionTagInput';

const CATEGORIES = PRODUCT_CATEGORIES;

export default function EditProductPage() {
  const router = useRouter();
  const supabase = createClient();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
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

        // Quota and usage come from the trusted server route, never the browser.
        try {
          const allowanceRes = await fetch('/api/upload/product-image', { cache: 'no-store' });
          if (allowanceRes.ok) {
            const allowance = await allowanceRes.json();
            setStorageQuota(allowance.quota != null ? Number(allowance.quota) : null);
            setStorageUsed(Number(allowance.usedBytes) || 0);
          }
        } catch (err) {
          console.warn('Could not load storage allowance', err);
        }

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
        setDiscountPercent(String(data.discount_percent ?? 0));
        setCategory(data.category || 'General');
        setDescription(data.description || '');
        setStock(data.stock !== null && data.stock !== undefined ? String(data.stock) : '');
        setUnit(data.unit || '');
        setExistingImage(safeImageSrc(data.image_url));
        setSizes(optionList(data.sizes));
        setColors(optionList(data.colors));
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [supabase, router, id]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setError(null);

    // Reject disguised/non-image or oversized files before rendering a preview.
    const fileError = file ? productImageFileError(file) : null;
    if (fileError) {
      e.target.value = '';
      setImageFile(null);
      revokePreviewUrl(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      setError(fileError);
      return;
    }

    setImageFile(file);
    revokePreviewUrl(previewUrlRef.current);
    const next = file ? URL.createObjectURL(file) : null;
    previewUrlRef.current = next;
    setPreviewUrl(next);
  };

  // Release the last preview blob when the page unmounts.
  useEffect(() => () => revokePreviewUrl(previewUrlRef.current), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceKobo = nairaToKobo(price);
    if (priceKobo === null) {
      setError('Enter a price greater than ₦0.');
      return;
    }

    const discountValue = discountPercent.trim() === '' ? 0 : Number(discountPercent);
    if (!Number.isInteger(discountValue) || discountValue < 0 || discountValue > 100) {
      setError('Discount must be a whole number between 0 and 100 percent.');
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

      // If a new image was chosen, upload it through the trusted server route;
      // otherwise keep the existing one.
      let imageUrl = existingImage;
      if (imageFile) {
        const form = new FormData();
        form.append('file', imageFile);
        const uploadRes = await fetch('/api/upload/product-image', { method: 'POST', body: form });
        const upload = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !upload.ok) {
          setError(upload.error || 'Could not upload the image. Please try again.');
          setSubmitting(false);
          return;
        }
        imageUrl = typeof upload.url === 'string' && upload.url ? upload.url : existingImage;
      }

      const { error: updateError } = await supabase
        .from('products')
        .update({
          title: title.trim(),
          price: priceKobo,
          discount_percent: discountValue,
          category,
          description: description.trim(),
          image_url: imageUrl,
          stock: stockValue,
          unit: unit.trim() || null,
          sizes: optionList(sizes),
          colors: optionList(colors),
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
            <label className="text-xs font-mono text-neutral-300">Discount off price (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="0"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
            />
            <p className="text-[10px] text-neutral-500 font-mono">
              Optional. Enter 10 for 10% off — buyers pay the discounted price and you still earn 3% commission on it.
            </p>
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

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-white">Options (optional)</p>
              <p className="mt-0.5 text-[10px] font-mono text-neutral-500">
                Add sizes or colours only if this product has them. Buyers must choose one before adding it to the cart.
              </p>
            </div>
            <OptionTagInput
              label="Sizes"
              placeholder="e.g. S, M, L, XL"
              hint="Examples: S/M/L, 128GB/256GB, 1kg/2kg. Leave empty if not applicable."
              value={sizes}
              onChange={setSizes}
            />
            <OptionTagInput
              label="Colours"
              placeholder="e.g. Black, White, Navy"
              hint="Leave empty if the item has no colour choice."
              value={colors}
              onChange={setColors}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-neutral-300">Sold by (unit)</label>
              <input
                type="text"
                list="product-units"
                placeholder="e.g. cup, congo, kg, piece"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
              />
              <datalist id="product-units">
                {PRODUCT_UNITS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            <div className="rounded-xl border border-[#eee4dc] bg-[#fff7f2] p-3 text-[10px] leading-4 text-[#81756d]">
              FuhsiMarket handles delivery centrally. Buyers who choose delivery pay one flat ₦1,000 fee for the whole order.
            </div>
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
            <label className="text-xs font-mono text-neutral-300">Product Image (JPG/PNG/WEBP/GIF, max 4MB)</label>
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
            {(safeImageSrc(previewUrl) || safeImageSrc(existingImage)) && (
              <img
                src={(safeImageSrc(previewUrl) || safeImageSrc(existingImage)) ?? undefined}
                alt="Product image preview"
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

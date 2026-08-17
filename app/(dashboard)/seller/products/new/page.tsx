'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { PackagePlus, Loader2, ArrowLeft } from 'lucide-react';

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
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price) return alert('Title and price are required.');

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { error } = await supabase.from('products').insert([
        {
          seller_id: user.id,
          title: title.trim(),
          price: parseFloat(price),
          category,
          description: description.trim(),
          image_url: imageUrl.trim() || null,
          is_available: true,
        },
      ]);

      if (error) throw error;

      router.push('/seller/products');
    } catch (err: any) {
      alert('Failed to post product: ' + err.message);
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
            <label className="text-xs font-mono text-neutral-300">Description</label>
            <textarea
              placeholder="Describe item condition, pickup location on campus..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600 resize-none h-28"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-neutral-300">Image URL (Optional)</label>
            <input
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
            />
          </div>

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
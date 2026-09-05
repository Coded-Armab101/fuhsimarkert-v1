/**
 * Product image upload with a per-seller storage quota.
 *
 * Enforces:
 *  - a 2MB cap per file (also enforced by the bucket's `file_size_limit`), and
 *  - a per-seller total quota (default 8MB, adjustable on `profiles`).
 * Objects are namespaced under `{sellerId}/` so a seller's *total* usage can be
 * computed by listing their prefix and summing sizes — self-healing and immune
 * to drift from a missed delete.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const BUCKET = 'product-images';

import type { SupabaseClient } from '@supabase/supabase-js';

/** A Supabase browser client (has a `.storage` API). */
type StorageClient = Pick<SupabaseClient, 'storage'>;

type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/** Total bytes the seller has stored in the bucket (sums their prefix). */
export async function getSellerStorageUsed(
  supabase: StorageClient,
  sellerId: string,
): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${sellerId}/`, {
    limit: 1000,
  });
  if (error) return 0;
  return (data || []).reduce((sum, obj) => sum + (Number(obj.metadata?.size) || 0), 0);
}

export async function uploadProductImage(
  supabase: StorageClient,
  sellerId: string,
  file: File | null,
  quota: number | null,
): Promise<UploadResult> {
  if (!file) return { ok: true, url: '' };
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, error: 'Only JPG, PNG, WEBP or GIF images are allowed.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'Image must be 2MB or smaller.' };
  }

  // Enforce the seller's total quota before accepting more.
  if (quota !== null && quota > 0) {
    const used = await getSellerStorageUsed(supabase, sellerId);
    if (used + file.size > quota) {
      return {
        ok: false,
        error: `You have used up your storage allowance. Delete an existing image or compress your photo to add more. (Limit: ${(quota / 1024 / 1024).toFixed(0)}MB)`,
      };
    }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${sellerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error || !data?.path) {
    console.error('[upload] failed', error);
    return { ok: false, error: 'Could not upload the image. Please try again.' };
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
  return { ok: true, url };
}
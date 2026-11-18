/**
 * Server-only product image upload with a per-seller storage quota.
 *
 * SECURITY: this module must never be imported into client code. The quota and
 * the current usage are read/verified on the server, and the file is uploaded
 * with the service-role client, so a browser cannot lie about either value.
 * Callers should use `POST /api/upload/product-image` rather than importing
 * these helpers directly.
 *
 * Enforces:
 *  - a 4MB cap per file (Vercel caps serverless request bodies at 4.5MB), and
 *  - a per-seller total quota (default 8MB, adjustable on `profiles`).
 * Objects are namespaced under `{sellerId}/` so a seller's *total* usage can be
 * computed by listing their prefix and summing sizes — self-healing and immune
 * to drift from a missed delete.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error(
    'utils/upload.ts was imported into client code. Uploads must go through ' +
      '/api/upload/product-image so the quota is enforced on the server.',
  );
}

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB — under Vercel's 4.5MB body limit
export const ALLOWED_PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Page size when listing objects for the quota sum. */
const LIST_PAGE_SIZE = 200;
const BUCKET = 'product-images';

/** A client with a `.storage` API (the service-role client in the API route). */
type StorageClient = Pick<SupabaseClient, 'storage'>;

export type StorageUsageResult =
  | { ok: true; bytes: number }
  | { ok: false; error: string };

/**
 * Total bytes the seller has stored in the bucket (sums their prefix).
 *
 * FAIL CLOSED: if any page of the listing fails we return `ok: false` instead
 * of a misleading `0`. Callers must refuse the upload when this happens —
 * treating a failed lookup as "no usage" would let a seller exceed their quota
 * whenever listing is broken or throttled. We paginate through every object so
 * the 1,000-object cap cannot hide stored files.
 */
export async function getSellerStorageUsed(
  supabase: StorageClient,
  sellerId: string,
): Promise<StorageUsageResult> {
  let offset = 0;
  let total = 0;

  try {
    // A hard ceiling prevents an unexpected loop if a broken API keeps
    // returning full pages. 200 * 200 = 40,000 objects — far beyond any seller.
    for (let page = 0; page < 200; page += 1) {
      const { data, error } = await supabase.storage.from(BUCKET).list(`${sellerId}/`, {
        limit: LIST_PAGE_SIZE,
        offset,
      });
      if (error) {
        return { ok: false, error: error.message || 'Could not read storage usage.' };
      }

      const objects = data || [];
      for (const obj of objects) {
        const size = Number(obj?.metadata?.size);
        if (Number.isFinite(size) && size > 0) total += size;
      }

      if (objects.length < LIST_PAGE_SIZE) return { ok: true, bytes: total };
      offset += LIST_PAGE_SIZE;
    }

    return { ok: false, error: 'Storage listing exceeded the safety limit.' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not read storage usage.',
    };
  }
}

export type UploadProductImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Validate and upload one product image. `quota` MUST come from a trusted
 * server-side profile read — never from the browser.
 */
export async function uploadProductImage(
  supabase: StorageClient,
  sellerId: string,
  file: File,
  quota: number | null,
): Promise<UploadProductImageResult> {
  if (!(ALLOWED_PRODUCT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Only JPG, PNG, WEBP or GIF images are allowed.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'Image must be 4MB or smaller.' };
  }

  if (quota !== null && quota > 0) {
    const usage = await getSellerStorageUsed(supabase, sellerId);
    if (!usage.ok) {
      // Never grant more storage when we cannot prove how much is already used.
      return {
        ok: false,
        error: 'Could not verify your storage allowance. Please try again.',
      };
    }
    if (usage.bytes + file.size > quota) {
      return {
        ok: false,
        error: `You have used up your storage allowance. Delete an existing image or compress your photo to add more. (Limit: ${(quota / 1024 / 1024).toFixed(0)}MB)`,
      };
    }
  }

  // Derive the extension from the validated MIME type, not the filename, so a
  // crafted name cannot influence the storage path.
  const ext = EXT_BY_TYPE[file.type] || 'jpg';
  const path = `${sellerId}/${globalThis.crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error || !data?.path) {
    console.error('[upload] failed', error);
    return { ok: false, error: 'Could not upload the image. Please try again.' };
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
  return { ok: true, url };
}

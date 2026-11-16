/**
 * Safe rendering helpers for seller-supplied product image URLs.
 *
 * Product image URLs can come from the database (edit page) or from a file the
 * seller just selected (new/edit preview). Writing that text straight into an
 * `<img src>` lets a stored `javascript:`, `data:text/html` or similar value be
 * interpreted as active content by the browser (the "DOM text reinterpreted as
 * HTML" finding). Only local blob previews created by `URL.createObjectURL` and
 * absolute `https:` URLs are ever allowed through.
 */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per file
export const ALLOWED_PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** A selected file must be an allowed image type and within the size cap. */
export function productImageFileError(file: File): string | null {
  if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(
    file.type as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number],
  )) {
    return 'Only JPG, PNG, WEBP or GIF images are allowed.';
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    return 'Image must be 5MB or smaller.';
  }
  return null;
}

/**
 * Return a URL that is safe to place in an image `src`, or `null`.
 *
 * Allowed:
 *  - same-origin relative paths (`/images/x.png`)
 *  - `https:` URLs (Supabase public storage URLs)
 *  - `blob:` URLs created in this tab for the selected file preview
 *
 * Everything else (`javascript:`, `data:`, `vbscript:`, `file:`, protocol
 * relative `//evil.example`) is rejected. Control characters and whitespace are
 * rejected first because browsers strip them when resolving a URL scheme.
 */
export function safeImageSrc(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/[\u0000-\u001F\u007F\s]/.test(trimmed)) return null;

  // Same-origin relative path, but not a protocol-relative `//host` URL.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol === 'https:' || parsed.protocol === 'blob:') {
    return parsed.href;
  }
  return null;
}

/** Release a preview object URL created by `URL.createObjectURL`. */
export function revokePreviewUrl(url: string | null | undefined) {
  if (url && url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

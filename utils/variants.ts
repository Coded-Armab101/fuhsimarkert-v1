/**
 * Product option helpers shared by the seller forms, buyer catalogue, cart and
 * the server-side checkout code. Options are deliberately free text per product
 * (a shirt has S/M/L, a phone has 128GB/256GB) instead of a global size list.
 */

export type VariantFields = {
  size?: string | null;
  color?: string | null;
  variant_key?: string | null;
};

export type ProductOptionFields = {
  sizes?: unknown;
  colors?: unknown;
};

export type ResolvedProductOptions = {
  size: string | null;
  color: string | null;
  variantKey: string;
};

/** Trim, collapse whitespace and cap an option so it fits the DB columns. */
export function cleanOption(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 40);
}

/**
 * Stable identity for one product-variant line. `size::color` keeps the two
 * dimensions separate; an empty string means "not applicable".
 */
export function normalizeVariantKey(size?: unknown, color?: unknown): string {
  const s = cleanOption(size);
  const c = cleanOption(color);
  return s || c ? `${s}::${c}` : '';
}

/** Key used by CartContext for every operation (quantity, remove, merge). */
export function cartLineKey(item: { id: string } & VariantFields): string {
  // Derive from the visible fields rather than trusting a persisted key. This
  // repairs older local carts that gained size/colour before `variant_key` was
  // stored and prevents a stale key from merging two different selections.
  const key = normalizeVariantKey(item.size, item.color);
  return key ? `${item.id}::${key}` : item.id;
}

/** Human-readable selection, e.g. "Size M · Black". */
export function variantLabel(size?: unknown, color?: unknown): string {
  const parts: string[] = [];
  const s = cleanOption(size);
  const c = cleanOption(color);
  if (s) parts.push(`Size ${s}`);
  if (c) parts.push(c);
  return parts.join(' · ');
}

/** Accepts a text[] from Postgres (or comma/newline-separated form input). */
export function optionList(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  const raw = entries.flatMap((entry) =>
    typeof entry === 'string' ? entry.split(/[,\n\r]+/) : [],
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const clean = cleanOption(entry);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 20) break;
  }
  return out;
}

export function hasProductOptions(product: {
  sizes?: unknown;
  colors?: unknown;
}): boolean {
  return optionList(product.sizes).length > 0 || optionList(product.colors).length > 0;
}

function selectedOption(options: string[], selected: unknown): string | null | undefined {
  const clean = cleanOption(selected);

  // A value is not allowed when the product does not expose that option type.
  if (options.length === 0) return clean ? undefined : null;
  if (!clean) return undefined;

  // Preserve the seller's spelling/capitalisation while accepting a harmless
  // case difference from a stale browser cart.
  return options.find((option) => option.toLowerCase() === clean.toLowerCase());
}

/**
 * Resolve a buyer selection against this product's own option lists.
 *
 * `null` means the selection is incomplete or contains a value the seller did
 * not offer. Checkout uses this server-side as well as the catalogue UI, so a
 * crafted cart row cannot order an arbitrary size or colour.
 */
export function resolveProductOptions(
  product: ProductOptionFields,
  size: unknown,
  color: unknown,
): ResolvedProductOptions | null {
  const resolvedSize = selectedOption(optionList(product.sizes), size);
  const resolvedColor = selectedOption(optionList(product.colors), color);

  if (resolvedSize === undefined || resolvedColor === undefined) return null;

  return {
    size: resolvedSize,
    color: resolvedColor,
    variantKey: normalizeVariantKey(resolvedSize, resolvedColor),
  };
}

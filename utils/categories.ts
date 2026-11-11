/**
 * Single source of truth for product categories.
 *
 * The seller form and the public marketplace both read from this list so a
 * listing can never land in a category the marketplace does not understand.
 * The first block is the original set (kept for existing rows); the rest are
 * the expanded campus categories.
 */
export const PRODUCT_CATEGORIES = [
  'General',
  'Textbooks & Academics',
  'Electronics & Gadgets',
  'Fashion & Apparel',
  'Hostel & Room Essentials',
  'Food & Snacks',
  'Services',
  'Phones & Accessories',
  'Shoes & Bags',
  'Beauty & Personal Care',
  'Health & Wellness',
  'Home & Kitchen',
  'Sports & Fitness',
  'Gaming & Music',
  'Stationery & Art',
  'Tickets & Events',
  'Others',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Categories always offered as browse chips, even before a listing uses them. */
export const FEATURED_CATEGORIES: ProductCategory[] = [
  'Textbooks & Academics',
  'Electronics & Gadgets',
  'Phones & Accessories',
  'Fashion & Apparel',
  'Food & Snacks',
  'Hostel & Room Essentials',
  'Beauty & Personal Care',
  'Services',
];

export function isProductCategory(value: string | null | undefined): value is ProductCategory {
  return !!value && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

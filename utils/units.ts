/**
 * Common selling units.
 *
 * Campus groceries are not always sold by the piece: garri and beans are sold
 * by cup or "congo", pepper by cup or sachet, pomo by piece. The seller picks a
 * unit (or types their own) and the buyer then sees "₦X / cup" with the normal
 * quantity stepper, so "2 cups" is just quantity 2.
 *
 * These are suggestions for a <datalist>; the input accepts any short label.
 */
export const PRODUCT_UNITS = [
  // Nigerian market measures
  'cup',
  'congo',
  'paint bucket',
  'bowl',
  'sachet',
  'bag',
  'bunch',
  'tin',
  'bottle',
  'litre',
  'gram',
  'kg',
  // Generic units
  'piece',
  'pack',
  'set',
  'pair',
  'dozen',
  'yard',
  'tablet',
  'carton',
] as const;

/** Common grocery/food categories where a unit input is most useful. */
export const FOOD_CATEGORIES = new Set(['Food & Snacks', 'Health & Wellness', 'Home & Kitchen']);

export function isFoodCategory(category: string | null | undefined): boolean {
  return Boolean(category && FOOD_CATEGORIES.has(category));
}

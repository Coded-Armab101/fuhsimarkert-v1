/**
 * Search helpers.
 *
 * PostgREST's `.or()` filter uses commas/parentheses as syntax, so a raw user
 * query containing them can break the request. We strip the structural
 * characters and keep everything else (including spaces and apostrophes).
 *
 * Product search covers title, description and category. Seller-name matching
 * is handled by the `search_products` SQL function (which can read profiles
 * without exposing them); the `.or()` fallback below is used when that function
 * has not been applied yet.
 */
export function cleanSearchTerm(input: string): string {
  return input.replace(/[,()%]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function productSearchFilter(input: string): string | null {
  const term = cleanSearchTerm(input);
  if (!term) return null;
  return [
    `title.ilike.%${term}%`,
    `description.ilike.%${term}%`,
    `category.ilike.%${term}%`,
  ].join(',');
}

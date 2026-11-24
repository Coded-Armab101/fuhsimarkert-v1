import test from 'node:test';
import assert from 'node:assert/strict';

// Dependency-free copies of the small pure helpers used by app/page.tsx and
// app/(dashboard)/buyer/page.tsx. Keep the logic in sync with those pages.

type CardFields = { sizes?: unknown; colors?: unknown };
type StockFields = { show_stock_count?: boolean | null; stock?: number | null };

function hasProductOptions(product: CardFields): boolean {
  return (
    (Array.isArray(product.sizes) && product.sizes.length > 0) ||
    (Array.isArray(product.colors) && product.colors.length > 0)
  );
}

/** The card action is always "Add to cart"; variants just open the picker first. */
export function productCardButtonLabel(product: CardFields): 'Add to cart' {
  return hasProductOptions(product) ? 'Add to cart' : 'Add to cart';
}

/** Buyers only see an exact count when the seller opted in and stock is real. */
export function stockCountLabel(product: StockFields): string | null {
  if (product.show_stock_count !== true) return null;
  if (product.stock === null || product.stock === undefined) return null;
  const stock = Number(product.stock);
  return Number.isFinite(stock) && stock > 0 ? `In stock · ${stock} left` : null;
}

test('variant and plain product cards both lead with Add to cart', () => {
  assert.equal(productCardButtonLabel({ sizes: ['S', 'M'] }), 'Add to cart');
  assert.equal(productCardButtonLabel({ colors: ['Black'] }), 'Add to cart');
  assert.equal(productCardButtonLabel({ sizes: [], colors: [] }), 'Add to cart');
  assert.equal(productCardButtonLabel({}), 'Add to cart');
});

test('exact stock label requires seller opt-in and positive stock', () => {
  assert.equal(stockCountLabel({ show_stock_count: true, stock: 7 }), 'In stock · 7 left');
  assert.equal(stockCountLabel({ show_stock_count: true, stock: 1 }), 'In stock · 1 left');
  assert.equal(stockCountLabel({ show_stock_count: false, stock: 7 }), null);
  assert.equal(stockCountLabel({ stock: 7 }), null);
  assert.equal(stockCountLabel({ show_stock_count: true, stock: 0 }), null);
  assert.equal(stockCountLabel({ show_stock_count: true, stock: null }), null);
  assert.equal(stockCountLabel({ show_stock_count: true }), null);
  assert.equal(stockCountLabel({ show_stock_count: true, stock: -2 }), null);
});

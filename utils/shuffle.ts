/**
 * Deterministic, seeded Fisher–Yates shuffle.
 *
 * The marketplace used to order products by `created_at desc`, which meant a
 * seller's newest upload always occupied the first tile. A stable seed lets us
 * scatter the catalogue without the grid jumping every time React re-renders
 * (for example when a cart quantity changes). Change the seed to reshuffle.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0 || 1;

  // mulberry32 — tiny, fast, and good enough for display order.
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export function newShuffleSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) || 1;
}

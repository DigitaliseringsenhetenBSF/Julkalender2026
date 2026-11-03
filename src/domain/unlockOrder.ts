/**
 * Deterministic, shared unlock order. See docs/SPEC.md §5.4.
 */

/**
 * mulberry32: a tiny, well-known 32-bit seeded PRNG. Not cryptographic – it only needs to give
 * every environment the same sequence for the same seed. Returns floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle driven by mulberry32(seed). Does not mutate `ids`. */
export function shuffledUnlockOrder(ids: readonly number[], seed: number): number[] {
  const random = mulberry32(seed);
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
}

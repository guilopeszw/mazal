// ─── packages/sim/rng.ts ─────────────────────────────────────────────────
// The only randomness in this package. Everything else takes an Rng.
//
// Math.random() cannot appear anywhere in packages/sim: docs/plan/B-data.md
// requires the demo fixtures to be "generated from fixed seeds so every machine
// produces identical numbers", and a single unseeded call anywhere in the tree
// breaks that for the whole run.

export type Rng = {
  /** Uniform on [0, 1). */
  float(): number;
  /** Uniform integer on [lo, hi], both inclusive. */
  int(lo: number, hi: number): number;
  /** Normal draw. Box–Muller, so it consumes two floats. */
  normal(mean: number, sd: number): number;
  /** Positive draw whose median is `median` and whose log has spread `sigma`. */
  lognormal(median: number, sigma: number): number;
  /** Uniform choice from a non-empty array. */
  pick<T>(xs: readonly T[]): T;
};

/**
 * mulberry32 — 32 bits of state, one multiply-shift round. Chosen because it is
 * eight lines, has no dependency, and gives the same stream on every engine,
 * which is the only property that matters here.
 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;

  const float = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = (mean: number, sd: number): number => {
    // Box–Muller. u1 is nudged off zero because Math.log(0) is -Infinity.
    const u1 = float() || Number.EPSILON;
    const u2 = float();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  return {
    float,
    normal,
    int: (lo, hi) => lo + Math.floor(float() * (hi - lo + 1)),
    lognormal: (median, sigma) => median * Math.exp(normal(0, sigma)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(float() * xs.length)]!,
  };
}

// ─── packages/sim/store.ts ───────────────────────────────────────────────
// A simulated store is drawn from the Olist quartiles in packages/data, so it
// is a plausible Brazilian store rather than a made-up one. B-data.md, Part 2,
// step 1.

import {
  OLIST_CATEGORIES,
  type Distribution,
  type OlistCategory,
  type PaymentMethod,
  type ProductCard,
} from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import type { Rng } from './rng.ts';

/**
 * Draws a value whose quartiles match `d`. Piecewise-linear through p25, median
 * and p75, with the outer eighths extrapolated one half-IQR further out so the
 * tails are not clipped flat.
 *
 * We have three points of a distribution, not its shape, and this is the
 * cheapest curve that honours all three. A metric with n: 0 — the five media
 * priors — is drawn the same way; it is only ever as good as the prior.
 */
export function sampleFromQuartiles(rng: Rng, d: Distribution): number {
  const u = rng.float();
  const iqr = Math.max(d.p75 - d.p25, 0);

  if (u < 0.125) return d.p25 - iqr * (0.125 - u) * 4;
  if (u < 0.5) return d.p25 + (d.median - d.p25) * ((u - 0.125) / 0.375);
  if (u < 0.875) return d.median + (d.p75 - d.median) * ((u - 0.5) / 0.375);
  return d.p75 + iqr * (u - 0.875) * 4;
}

const PAYMENT_SETS: readonly (readonly PaymentMethod[])[] = [
  ['credit', 'pix'],
  ['credit', 'pix', 'boleto'],
  ['credit', 'debit', 'pix', 'boleto', 'installments'],
  ['credit', 'installments'],
];

/** A ProductCard drawn from one category's Olist distributions. */
export function sampleStore(rng: Rng, category?: OlistCategory): ProductCard {
  const cat = category ?? rng.pick(OLIST_CATEGORIES);
  const m = benchmarks[cat].metrics;

  const positive = (x: number, floor: number) => Math.max(x, floor);
  const wholeAtLeast = (x: number, floor: number) => Math.max(Math.round(x), floor);

  // One price draw, used twice. Drawing a second one for the freight base let a
  // R$5 item carry R$24 of shipping — the two numbers are a ratio in Olist and
  // sampling them independently throws that away.
  const price = Math.max(sampleFromQuartiles(rng, m.price), m.price.p25 * 0.25);

  return {
    category: cat,
    price: Number(price.toFixed(2)),
    // Not in Olist — Brazilian retail gross margin, centred at 45%.
    grossMargin: Number(Math.min(Math.max(rng.normal(0.45, 0.12), 0.05), 0.9).toFixed(3)),
    shippingCost: Number(positive(price * sampleFromQuartiles(rng, m.freightRatio), 0).toFixed(2)),
    deliveryEtaDays: wholeAtLeast(sampleFromQuartiles(rng, m.deliveryDays), 1),
    stockOnHand: rng.int(20, 800),
    reviewCount: wholeAtLeast(rng.lognormal(40, 1.1), 0),
    reviewAvg: Number(Math.min(Math.max(sampleFromQuartiles(rng, m.reviewAvg), 1), 5).toFixed(2)),
    pdpImages: wholeAtLeast(sampleFromQuartiles(rng, m.photos), 1),
    pdpDescriptionLength: wholeAtLeast(sampleFromQuartiles(rng, m.descriptionLength), 0),
    returnPolicyDays: rng.pick([7, 7, 14, 30]),
    paymentMethods: [...rng.pick(PAYMENT_SETS)],
    offer: rng.pick(['none', 'none', 'discount', 'free_shipping_threshold', 'bundle'] as const),
  };
}

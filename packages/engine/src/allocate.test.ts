// ─── packages/engine/src/allocate.test.ts ────────────────────────────────
// The Allocator, layers 1 and 2 of `optimization.md`: a response curve per
// adset, and the split of a fixed budget across them.
//
// Every expected value here comes from an independent source — a curve whose
// true parameters the test chose, or a property that must hold at any optimum —
// never from re-running the implementation's own arithmetic.

import { describe, expect, it } from 'vitest';
import {
  allocate,
  fitCurve,
  marginalRevenue,
  priorCurve,
  reallocate,
  valueAt,
} from './allocate.ts';
import type { ResponseCurve } from '@mazal/contracts';

/** A curve the test owns, so recovery can be checked against a known truth. */
const TRUE: ResponseCurve = { vMax: 40, k: 120, alpha: 1, n: 0, source: 'prior' };

/** Noiseless days generated from `TRUE`, spread across the bend. */
const daysFrom = (curve: ResponseCurve, spends: number[]) =>
  spends.map((spend, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    campaignId: 'c1',
    spend,
    impressions: 0,
    reach: 0,
    clicks: 0,
    addToCarts: 0,
    checkoutsInitiated: 0,
    purchases: valueAt(curve, spend),
    revenue: 0,
  }));

const PRIOR = priorCurve({ cpc: 1.2, cvr: 0.02, typicalSpend: 100 });

describe('valueAt', () => {
  it('is zero at zero spend and approaches the ceiling, never crossing it', () => {
    expect(valueAt(TRUE, 0)).toBe(0);
    // At s = k the Hill curve is at exactly half its ceiling, for any alpha.
    expect(valueAt(TRUE, TRUE.k)).toBeCloseTo(TRUE.vMax / 2, 10);
    expect(valueAt(TRUE, 1e9)).toBeLessThan(TRUE.vMax);
    expect(valueAt(TRUE, 1e9)).toBeGreaterThan(TRUE.vMax * 0.999);
  });

  it('is concave — each extra real buys less than the one before', () => {
    const step = 10;
    let previousGain = Infinity;
    for (let s = 0; s < 400; s += step) {
      const gain = valueAt(TRUE, s + step) - valueAt(TRUE, s);
      expect(gain).toBeLessThan(previousGain);
      previousGain = gain;
    }
  });
});

describe('fitCurve', () => {
  it('recovers a curve it was never told, from noiseless days', () => {
    const days = daysFrom(TRUE, [20, 40, 60, 90, 120, 160, 200, 260, 320, 400]);
    const fitted = fitCurve(days, PRIOR);

    // Recovery is judged on what the curve PREDICTS, not on its parameters:
    // vMax and k trade off against each other, so two different parameter sets
    // can describe the same curve to within a rounding error.
    for (const s of [30, 75, 150, 300]) {
      expect(valueAt(fitted, s)).toBeCloseTo(valueAt(TRUE, s), 1);
    }
    expect(fitted.source).toBe('fitted');
  });

  it('is the prior exactly when there is no history at all', () => {
    const fitted = fitCurve([], PRIOR);
    expect(fitted).toEqual({ ...PRIOR, n: 0, source: 'prior' });
  });

  it('sits between the prior and its own evidence on thin history', () => {
    // Three days is not enough to trust a three-parameter fit. The result must
    // move toward the evidence without arriving at it — that is the whole point
    // of partial pooling, and the cold-start answer in optimization.md §1.
    const days = daysFrom(TRUE, [50, 100, 150]);
    const blended = fitCurve(days, PRIOR);

    const at = (c: ResponseCurve) => valueAt(c, 100);
    const [prior, truth, got] = [at(PRIOR), at(TRUE), at(blended)];

    const between = (x: number) =>
      x > Math.min(prior, truth) && x < Math.max(prior, truth);
    expect(between(got)).toBe(true);
    expect(blended.source).toBe('blended');
    expect(blended.n).toBe(3);
  });

  it('ignores days with no spend rather than fitting a point at the origin', () => {
    const days = daysFrom(TRUE, [0, 0, 20, 40, 60, 90, 120, 160, 200, 260, 320, 400]);
    expect(fitCurve(days, PRIOR).n).toBe(10);
  });
});

describe('allocate', () => {
  /** Two adsets, the second saturating sooner than the first. */
  const hungry: ResponseCurve = { vMax: 60, k: 200, alpha: 1, n: 30, source: 'fitted' };
  const full: ResponseCurve = { vMax: 22, k: 25, alpha: 1, n: 30, source: 'fitted' };
  const VALUE = 50; // BRL of margin per conversion — price × grossMargin.

  it('equalises the marginal return across every funded adset', () => {
    const { split } = allocate([
      { id: 'a', curve: hungry },
      { id: 'b', curve: full },
    ], { budget: 300, valuePerConversion: VALUE });

    const marginals = split
      .filter((s) => s.spend > 0)
      .map((s) => marginalRevenue(s.id === 'a' ? hungry : full, s.spend, VALUE));

    // The defining property of the optimum: the next real earns the same
    // wherever you put it. If it did not, moving money would pay.
    for (const m of marginals) expect(m).toBeCloseTo(marginals[0]!, 4);
  });

  it('spends the whole budget, and never more', () => {
    const { split, totalSpend } = allocate([
      { id: 'a', curve: hungry },
      { id: 'b', curve: full },
    ], { budget: 300, valuePerConversion: VALUE });

    expect(totalSpend).toBeCloseTo(300, 6);
    expect(split.reduce((sum, s) => sum + s.spend, 0)).toBeCloseTo(300, 6);
  });

  it('beats putting everything on the best adset', () => {
    // Greedy is what sellers actually do, and it is wrong for one reason: the
    // best adset fills up. optimization.md §5 names this as the baseline to
    // beat visibly.
    const adsets = [
      { id: 'a', curve: hungry },
      { id: 'b', curve: full },
    ];
    const budget = 300;
    const { profit } = allocate(adsets, { budget, valuePerConversion: VALUE });

    const greedy = Math.max(
      ...adsets.map((a) => valueAt(a.curve, budget) * VALUE - budget),
    );
    expect(profit).toBeGreaterThan(greedy);
  });

  it('beats splitting the budget evenly', () => {
    const adsets = [
      { id: 'a', curve: hungry },
      { id: 'b', curve: full },
    ];
    const budget = 300;
    const { profit } = allocate(adsets, { budget, valuePerConversion: VALUE });

    const even = adsets.reduce(
      (sum, a) => sum + valueAt(a.curve, budget / 2) * VALUE - budget / 2,
      0,
    );
    expect(profit).toBeGreaterThan(even);
  });

  it('names a profit-maximising budget below the one that maximises revenue', () => {
    // Sellers spend past this point and read rising revenue as scaling working,
    // while profit is already falling. Naming it is the point of the feature.
    const { profitMaxBudget } = allocate([{ id: 'a', curve: hungry }], {
      budget: 10_000,
      valuePerConversion: VALUE,
    });

    expect(profitMaxBudget).toBeGreaterThan(0);
    expect(profitMaxBudget).toBeLessThan(10_000);

    // At that budget the last real spent earns back exactly itself.
    expect(marginalRevenue(hungry, profitMaxBudget, VALUE)).toBeCloseTo(1, 3);

    // And profit there is not beaten by spending more.
    const profitAt = (s: number) => valueAt(hungry, s) * VALUE - s;
    expect(profitAt(profitMaxBudget)).toBeGreaterThan(profitAt(profitMaxBudget * 1.5));
    expect(profitAt(profitMaxBudget)).toBeGreaterThan(profitAt(profitMaxBudget * 0.5));
  });

  it('refuses to starve a funded adset below the learning-phase floor', () => {
    // Meta needs a minimum daily spend before an adset leaves the learning
    // phase; an allocation that funds it below that buys nothing at all.
    const { split } = allocate([
      { id: 'a', curve: hungry },
      { id: 'b', curve: full },
    ], { budget: 300, valuePerConversion: VALUE, minPerAdset: 40 });

    for (const s of split) {
      expect(s.spend === 0 || s.spend >= 40).toBe(true);
    }
  });

  it('is deterministic — the same input gives the same answer', () => {
    const adsets = [
      { id: 'a', curve: hungry },
      { id: 'b', curve: full },
    ];
    const once = allocate(adsets, { budget: 317.5, valuePerConversion: VALUE });
    const twice = allocate(adsets, { budget: 317.5, valuePerConversion: VALUE });
    expect(once).toEqual(twice);
  });

  it('gives everything to the only adset there is', () => {
    const { split } = allocate([{ id: 'a', curve: hungry }], {
      budget: 120,
      valuePerConversion: VALUE,
    });
    expect(split).toEqual([{ id: 'a', spend: 120 }]);
  });
});

describe('reallocate', () => {
  const hungry: ResponseCurve = { vMax: 60, k: 200, alpha: 1, n: 30, source: 'fitted' };
  const full: ResponseCurve = { vMax: 22, k: 25, alpha: 1, n: 30, source: 'fitted' };
  const VALUE = 50;

  const adsets = [
    { id: 'a', curve: hungry, spend: 60 },
    { id: 'b', curve: full, spend: 240 },
  ];

  it('holds the budget exactly — it never asks the seller to spend more', () => {
    // The guarantee the rest of the product keeps: nothing Mazal proposes can
    // increase what a seller spends. Here it is arithmetic, not a policy.
    const r = reallocate(adsets, { valuePerConversion: VALUE });
    expect(r.budget).toBeCloseTo(300, 6);
    expect(r.moves.reduce((sum, m) => sum + m.delta, 0)).toBeCloseTo(0, 6);
  });

  it('finds money in the split when the seller has it backwards', () => {
    // Most of the budget is on the adset that saturates first, so there is real
    // profit available at the same spend.
    const r = reallocate(adsets, { valuePerConversion: VALUE });
    expect(r.gain).toBeGreaterThan(0);
    expect(r.bestProfit).toBeGreaterThan(r.currentProfit);
    expect(r.gain).toBeCloseTo(r.bestProfit - r.currentProfit, 6);
  });

  it('moves money off the saturated adset and onto the hungry one', () => {
    const r = reallocate(adsets, { valuePerConversion: VALUE });
    const byId = Object.fromEntries(r.moves.map((m) => [m.id, m.delta]));
    expect(byId['a']).toBeGreaterThan(0);
    expect(byId['b']).toBeLessThan(0);
  });

  it('says so plainly when the seller is already right', () => {
    // A tool that sometimes says "you are fine" is a tool people trust.
    const optimal = allocate(
      [{ id: 'a', curve: hungry }, { id: 'b', curve: full }],
      { budget: 300, valuePerConversion: VALUE },
    );
    const already = optimal.split.map((s) => ({
      id: s.id,
      curve: s.id === 'a' ? hungry : full,
      spend: s.spend,
    }));

    const r = reallocate(already, { valuePerConversion: VALUE });
    expect(r.gain).toBeLessThan(0.01);
    expect(r.moves).toEqual([]);
  });
});

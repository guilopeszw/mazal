// ─── packages/engine/src/allocate.ts ─────────────────────────────────────
// The Allocator: layers 1 and 2 of `optimization.md`.
//
// Layer 1 is one estimated function per adset — conversions as a function of
// spend. Layer 2 is the split of a fixed budget across those curves. Together
// they answer the question the diagnostic engine does not: not "what is
// broken", but "given what I can spend, what is the most I can make, and how
// far from it am I standing".
//
// ## Why this cannot raise a seller's spend
//
// `allocate` takes the budget as an input and returns a split that sums to it.
// There is no code path here that proposes a larger budget: the headline is
// "move R$40 a day from B to A", at the same total, and `profitMaxBudget` is
// reported so a seller can spend LESS. That keeps the Allocator inside the
// guarantee the rest of the product holds to — nothing Mazal runs can increase
// what a seller spends.
//
// ## Why the arithmetic is this plain
//
// Jha et al. (ICAART 2024) ran LSTM, GRU and RNN against linear regression and
// gradient boosting on this exact problem and the deep models lost — R² 0.56
// against 0.74. On thin, volatile campaign data, simple beats deep and
// explainable beats both. Everything below is closed-form or a bisection: no
// training, no dependencies, no randomness, and the same input always gives the
// same answer, which is what makes it safe to put in front of a seller's money.

import type { CampaignDay, ResponseCurve } from '@mazal/contracts';

/**
 * The bend of the curve, fixed rather than fitted.
 *
 * The Hill form allows an exponent that controls how sharply returns roll off.
 * We hold it at 1 — the Michaelis–Menten case — for two reasons. It leaves two
 * free parameters instead of three, which a seller with nine days of history
 * can actually identify; and at α ≤ 1 the curve is concave everywhere, so the
 * allocation below is a convex problem with one exact answer. Above 1 the curve
 * gains an S-bend, the marginal return stops being monotone, and the solver can
 * settle on a local optimum. A parameter we cannot estimate honestly and which
 * costs us the guarantee is not worth having.
 */
const ALPHA = 1;

/** Days of a campaign's own history before the fit stops leaning on the prior. */
const FIT_MIN_DAYS = 8;

/** Conversions per day at a given daily spend. */
export function valueAt(curve: ResponseCurve, spend: number): number {
  if (spend <= 0 || curve.vMax <= 0 || curve.k <= 0) return 0;
  const s = Math.pow(spend, curve.alpha);
  return (curve.vMax * s) / (Math.pow(curve.k, curve.alpha) + s);
}

/** What one more real of daily spend earns, in reais of margin. */
export function marginalRevenue(
  curve: ResponseCurve,
  spend: number,
  valuePerConversion: number,
): number {
  if (curve.vMax <= 0 || curve.k <= 0) return 0;
  const a = curve.alpha;
  const s = Math.max(spend, 0);
  const ka = Math.pow(curve.k, a);
  const sa = Math.pow(s, a);
  const denom = ka + sa;
  // d/ds of the Hill function. At s = 0 with α = 1 this is vMax / k, finite,
  // which is the steepest the curve ever gets.
  const slope =
    s === 0
      ? a === 1
        ? curve.vMax / curve.k
        : Number.POSITIVE_INFINITY
      : (curve.vMax * a * ka * Math.pow(s, a - 1)) / (denom * denom);
  return slope * valuePerConversion;
}

/**
 * The curve a campaign starts with, before it has spent anything.
 *
 * Built so its slope at zero matches what the category's own benchmarks say a
 * real buys: `cvr / cpc` conversions per real. The ceiling is placed far enough
 * out that the prior barely bends across the spends a seller actually runs —
 * a prior should say "we do not know where your ceiling is", not invent one.
 */
export function priorCurve({
  cpc,
  cvr,
  typicalSpend,
}: {
  cpc: number;
  cvr: number;
  typicalSpend: number;
}): ResponseCurve {
  const k = Math.max(typicalSpend, 1) * 4;
  const slope = cpc > 0 ? cvr / cpc : 0;
  return { vMax: k * slope, k, alpha: ALPHA, n: 0, source: 'prior' };
}

/**
 * Fit a curve to a campaign's own days, leaning on the category prior while
 * its evidence is thin.
 *
 * For a fixed `k` the best `vMax` is closed-form — the curve is linear in it —
 * so the whole fit is a one-dimensional search over `k`, done as a coarse sweep
 * then two refinement passes. No gradients, no initialisation, no local minima
 * to fall into, and it returns the same answer every time.
 *
 * Below `FIT_MIN_DAYS` the result is pulled toward the prior in proportion to
 * how much evidence exists. That is the cold-start answer: a new campaign is
 * mostly its category, and becomes itself as it earns the right to.
 */
export function fitCurve(days: CampaignDay[], prior: ResponseCurve): ResponseCurve {
  // A day with no spend says nothing about the shape of the curve, and fitting
  // it as a point at the origin drags the whole thing down.
  const usable = days.filter((d) => d.spend > 0);
  const n = usable.length;
  if (n === 0) return { ...prior, n: 0, source: 'prior' };

  const spends = usable.map((d) => d.spend);
  const values = usable.map((d) => d.purchases);
  const maxSpend = Math.max(...spends);

  /** Best `vMax` for this `k`, and the error it leaves behind. */
  const evaluate = (k: number): { vMax: number; sse: number } => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.pow(spends[i]!, ALPHA);
      const h = s / (Math.pow(k, ALPHA) + s);
      num += values[i]! * h;
      den += h * h;
    }
    const vMax = den > 0 ? num / den : 0;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.pow(spends[i]!, ALPHA);
      const h = s / (Math.pow(k, ALPHA) + s);
      const r = values[i]! - vMax * h;
      sse += r * r;
    }
    return { vMax, sse };
  };

  // Sweep k across four orders of magnitude around the spends actually seen,
  // then narrow twice around the winner.
  let lo = Math.max(maxSpend, 1) / 100;
  let hi = Math.max(maxSpend, 1) * 100;
  let bestK = lo;
  let bestVMax = 0;
  for (let pass = 0; pass < 3; pass++) {
    const steps = 240;
    let bestSse = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= steps; i++) {
      // Geometric, because k is a scale: the interesting values are spread
      // across magnitudes, not evenly along a line.
      const k = lo * Math.pow(hi / lo, i / steps);
      const { vMax, sse } = evaluate(k);
      if (sse < bestSse) {
        bestSse = sse;
        bestK = k;
        bestVMax = vMax;
      }
    }
    const span = Math.pow(hi / lo, 1 / steps);
    lo = bestK / (span * span);
    hi = bestK * span * span;
  }

  const fitted: ResponseCurve = {
    vMax: bestVMax,
    k: bestK,
    alpha: ALPHA,
    n,
    source: 'fitted',
  };
  if (n >= FIT_MIN_DAYS) return fitted;

  const w = n / FIT_MIN_DAYS;
  return {
    vMax: prior.vMax + w * (fitted.vMax - prior.vMax),
    k: prior.k + w * (fitted.k - prior.k),
    alpha: ALPHA,
    n,
    source: 'blended',
  };
}

export type Adset = { id: string; curve: ResponseCurve };

export type AllocateOptions = {
  /** The seller's budget. The split sums to exactly this and never exceeds it. */
  budget: number;
  /** Reais of margin per conversion — price × grossMargin. */
  valuePerConversion: number;
  /** Meta's learning phase needs a floor; funding below it buys nothing. */
  minPerAdset?: number;
};

export type Allocation = {
  split: { id: string; spend: number }[];
  totalSpend: number;
  /** Profit at this split: margin earned, less the spend. */
  profit: number;
  /**
   * Where the last real spent earns back exactly itself. Almost always below
   * the budget that maximises revenue — sellers spend past this point and read
   * rising revenue as scaling working while profit is already falling.
   */
  profitMaxBudget: number;
};

/** The spend at which one more real earns exactly `target`. */
function spendForMarginal(
  curve: ResponseCurve,
  target: number,
  valuePerConversion: number,
): number {
  if (target <= 0) return Number.POSITIVE_INFINITY;
  if (marginalRevenue(curve, 0, valuePerConversion) <= target) return 0;

  // The marginal is strictly decreasing (α ≤ 1), so bisection is exact to
  // whatever tolerance we ask of it and cannot land on a second solution.
  let lo = 0;
  let hi = Math.max(curve.k, 1);
  while (marginalRevenue(curve, hi, valuePerConversion) > target && hi < 1e12) {
    hi *= 2;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (marginalRevenue(curve, mid, valuePerConversion) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Split a budget so the next real earns the same wherever it lands.
 *
 * At the optimum every funded adset shares one marginal return. If they did
 * not, money moved from the low one to the high one would pay — which is the
 * whole argument, and the reason "put it all on the best adset" is wrong: the
 * best adset fills up.
 */
export function allocate(adsets: Adset[], options: AllocateOptions): Allocation {
  const { budget, valuePerConversion, minPerAdset = 0 } = options;
  const zero = (): Allocation => ({
    split: adsets.map((a) => ({ id: a.id, spend: 0 })),
    totalSpend: 0,
    profit: 0,
    profitMaxBudget: 0,
  });
  if (adsets.length === 0 || budget <= 0) return zero();

  // The budget at which spending stops paying for itself: one real in, one real
  // of margin out. Reported whatever the seller's budget actually is.
  const profitMaxBudget = adsets.reduce(
    (sum, a) => sum + spendForMarginal(a.curve, 1, valuePerConversion),
    0,
  );

  const solve = (members: Adset[], total: number): Map<string, number> => {
    const spends = new Map<string, number>();
    if (members.length === 0) return spends;

    // Total spend falls as the shared marginal rises, so bisect on the marginal.
    let lo = 1e-9;
    let hi = Math.max(
      ...members.map((a) => marginalRevenue(a.curve, 0, valuePerConversion)),
    );
    if (!Number.isFinite(hi) || hi <= 0) hi = 1;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const sum = members.reduce(
        (acc, a) => acc + spendForMarginal(a.curve, mid, valuePerConversion),
        0,
      );
      if (sum > total) lo = mid;
      else hi = mid;
    }
    const lambda = (lo + hi) / 2;
    for (const a of members) {
      spends.set(a.id, spendForMarginal(a.curve, lambda, valuePerConversion));
    }

    // Bisection lands within a rounding error of the budget; the remainder goes
    // to the largest holding so the split sums to what the seller actually has.
    const sum = [...spends.values()].reduce((acc, s) => acc + s, 0);
    const residual = total - sum;
    if (residual !== 0) {
      let biggest = members[0]!.id;
      for (const a of members) {
        if ((spends.get(a.id) ?? 0) > (spends.get(biggest) ?? 0)) biggest = a.id;
      }
      spends.set(biggest, Math.max(0, (spends.get(biggest) ?? 0) + residual));
    }
    return spends;
  };

  // Anything the optimum would fund below the learning-phase floor is not worth
  // funding at all: drop it and let the rest share what it would have had.
  let members = adsets;
  let spends = solve(members, budget);
  if (minPerAdset > 0) {
    for (let guard = 0; guard < adsets.length; guard++) {
      const starved = members.filter((a) => (spends.get(a.id) ?? 0) < minPerAdset);
      if (starved.length === 0 || starved.length === members.length) break;
      members = members.filter((a) => (spends.get(a.id) ?? 0) >= minPerAdset);
      spends = solve(members, budget);
    }
  }

  const split = adsets.map((a) => ({ id: a.id, spend: spends.get(a.id) ?? 0 }));
  const totalSpend = split.reduce((sum, s) => sum + s.spend, 0);
  const profit = adsets.reduce((sum, a) => {
    const spend = spends.get(a.id) ?? 0;
    return sum + valueAt(a.curve, spend) * valuePerConversion - spend;
  }, 0);

  return { split, totalSpend, profit, profitMaxBudget };
}

/** One adset's current daily spend, alongside the curve it earns on. */
export type FundedAdset = Adset & { spend: number };

export type Move = {
  id: string;
  from: number;
  to: number;
  /** Positive is money arriving, negative is money leaving. They sum to zero. */
  delta: number;
};

export type Reallocation = {
  /** What the seller already spends. The recommendation never exceeds it. */
  budget: number;
  currentProfit: number;
  bestProfit: number;
  /** The money sitting in the split, available at the same total spend. */
  gain: number;
  best: { id: string; spend: number }[];
  moves: Move[];
};

/**
 * The headline: what a seller is leaving on the table, at the budget they
 * already spend.
 *
 * The budget is not chosen here — it is read off what the seller is already
 * doing, and the recommendation redistributes exactly that. So the one number
 * this feature leads with is free money rather than a request for more, and the
 * moves it proposes sum to zero by construction, not by a check that could be
 * forgotten.
 */
export function reallocate(
  adsets: FundedAdset[],
  options: { valuePerConversion: number; minPerAdset?: number },
): Reallocation {
  const { valuePerConversion, minPerAdset } = options;
  const budget = adsets.reduce((sum, a) => sum + Math.max(0, a.spend), 0);

  const profitOf = (curve: ResponseCurve, spend: number) =>
    valueAt(curve, spend) * valuePerConversion - spend;

  const currentProfit = adsets.reduce(
    (sum, a) => sum + profitOf(a.curve, Math.max(0, a.spend)),
    0,
  );

  const best = allocate(
    adsets.map(({ id, curve }) => ({ id, curve })),
    { budget, valuePerConversion, ...(minPerAdset ? { minPerAdset } : {}) },
  );

  const gain = best.profit - currentProfit;

  // Below a real a day there is no move worth a seller's attention, and telling
  // them to shift small change reads as noise rather than advice.
  const MOVE_FLOOR = 1;
  const moves: Move[] =
    gain < 0.01
      ? []
      : best.split
          .map((s) => {
            const from = Math.max(0, adsets.find((a) => a.id === s.id)?.spend ?? 0);
            return { id: s.id, from, to: s.spend, delta: s.spend - from };
          })
          .filter((m) => Math.abs(m.delta) >= MOVE_FLOOR)
          .sort((a, b) => b.delta - a.delta);

  return {
    budget,
    currentProfit,
    bestProfit: best.profit,
    gain,
    best: best.split,
    moves,
  };
}

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
        : a < 1
          ? Number.POSITIVE_INFINITY
          : // For a > 1 the curve leaves the origin flat: s^(a-1) -> 0, so the
            // first real buys nothing. Returning Infinity here claimed the
            // opposite and handed the solver a bracket with no root in it.
            0
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
  const minSpend = Math.min(...spends);

  /**
   * A curve is only identifiable if the spend actually moved.
   *
   * `k` is the spend at which half the ceiling is reached, and a campaign held
   * at a flat daily budget contains no evidence about it: every `h` takes the
   * same value, the residuals are `y - ȳ` for every `k`, and SSE is exactly
   * flat. The sweep does not fail on that — it keeps the first grid point it
   * saw, `maxSpend / 100`, and returns a confident curve. Measured on 14 days
   * at R$100 against a truth of k = 300, it came back k = 0.96 and priced the
   * marginal return at R$0.02 where the truth was R$1.88, stamped `fitted`.
   *
   * Both demo fixtures sit in exactly that regime, and so does any seller who
   * left their daily budget alone — which is most of them. Below a doubling of
   * spend the honest answer is the prior, and the label has to say so; the
   * boundary where the fit starts recovering is around 1.7x.
   */
  const identifiable = minSpend > 0 && maxSpend / minSpend >= 2;
  if (!identifiable) {
    return { ...prior, n, source: n > 0 ? 'blended' : 'prior' };
  }

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

/**
 * A curve this module will actually solve against.
 *
 * `alpha` is a public contract field, so a caller can hand us any number, and
 * the solver's whole method — bisect on a shared marginal — assumes the marginal
 * is finite at zero and strictly decreasing. That is only true at alpha <= 1.
 * At alpha = 2 the bisection ran on a bracket with no root in it and returned a
 * split that spent R$574 of a R$300 budget: not a worse answer, a broken
 * guarantee. Anything we cannot solve is treated as a curve that earns nothing,
 * which spends nothing.
 */
function usable(curve: ResponseCurve): boolean {
  return (
    Number.isFinite(curve.vMax) &&
    Number.isFinite(curve.k) &&
    Number.isFinite(curve.alpha) &&
    curve.vMax > 0 &&
    curve.k > 0 &&
    curve.alpha > 0 &&
    curve.alpha <= 1
  );
}

/**
 * One thing a budget can be spent on: an adset, a campaign, or a whole product.
 *
 * `valuePerConversion` belongs here rather than on the options because it is a
 * property of the thing being sold, not of the account. A seller running a
 * R$30 broom beside a R$200 blender does not convert them into the same reais,
 * and a single shared value makes the allocator optimise CONVERSIONS —
 * sending money to whichever curve is steeper in units — when the only unit
 * that matters is money. Falls back to `AllocateOptions.valuePerConversion`
 * when every entity genuinely does sell the same thing.
 */
export type Adset = {
  id: string;
  curve: ResponseCurve;
  /** Reais of margin per conversion: price x grossMargin, for THIS entity. */
  valuePerConversion?: number;
};

export type AllocateOptions = {
  /** The seller's budget. The split never exceeds it. */
  budget: number;
  /**
   * Margin per conversion for every entity that does not name its own. Optional
   * now: an account selling several products states it per entity instead.
   */
  valuePerConversion?: number;
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

  /**
   * Nothing non-finite gets past here.
   *
   * `budget <= 0` is false for NaN, so a NaN budget used to walk straight into
   * the solver, collapse lambda onto its floor, and come back with a split of
   * R$24,494,697 a day — which `reallocate` then rendered as a move for a seller
   * to act on. A guarantee that holds only for well-formed input is not one, and
   * this is the boundary where the input stops being ours.
   */
  if (
    adsets.length === 0 ||
    !Number.isFinite(budget) ||
    budget <= 0 ||
    !Number.isFinite(minPerAdset) ||
    minPerAdset < 0
  ) {
    return zero();
  }

  /** What one conversion is worth here — the entity's own margin, or the shared one. */
  const valueOf = (a: Adset): number => a.valuePerConversion ?? valuePerConversion ?? NaN;

  // A curve we cannot solve against earns nothing, and neither does an entity
  // whose margin we cannot read: without a value per conversion there is no way
  // to say what its next real earns, so there is no way to compare it to
  // anything else. Both are funded nothing rather than guessed at.
  const solvable = adsets.filter(
    (a) => usable(a.curve) && Number.isFinite(valueOf(a)) && valueOf(a) > 0,
  );
  if (solvable.length === 0) return zero();

  // The budget at which spending stops paying for itself: one real in, one real
  // of margin out. Over the adsets that can actually be funded.
  const profitMaxBudget = solvable.reduce(
    (sum, a) => sum + spendForMarginal(a.curve, 1, valueOf(a)),
    0,
  );

  const solve = (members: Adset[], total: number): Map<string, number> => {
    const spends = new Map<string, number>();
    if (members.length === 0) return spends;

    /**
     * Total spend falls as the shared marginal rises, so bisect on the marginal.
     *
     * The floor is 1, not zero: at a shared marginal of 1 the last real spent
     * earns back exactly itself, and below that every further real destroys
     * value. Without the floor `allocate` maximised conversions subject to
     * spending the budget exactly, which on a R$5,000 budget against a curve
     * peaking at R$575 returned a split it called best and priced at a loss of
     * R$2,115 — while the profit optimum it reported in the same object was
     * +R$1,651. It now spends up to the budget and stops where spending pays.
     */
    let lo = 1;
    let hi = Math.max(...members.map((a) => marginalRevenue(a.curve, 0, valueOf(a))));
    if (!Number.isFinite(hi) || hi <= 0) hi = 1;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const sum = members.reduce(
        (acc, a) => acc + spendForMarginal(a.curve, mid, valueOf(a)),
        0,
      );
      if (sum > total) lo = mid;
      else hi = mid;
    }
    const lambda = (lo + hi) / 2;
    for (const a of members) {
      spends.set(a.id, spendForMarginal(a.curve, lambda, valueOf(a)));
    }

    /**
     * Bisection lands within a rounding error of the target; the remainder goes
     * to the largest holding so the split sums to it.
     *
     * Only a rounding error, though. When every member wants zero at every
     * lambda — dead curves, or a margin of zero — the sum is 0 and the residual
     * is the entire budget, which this used to hand to `members[0]`: the whole
     * of a seller's money on one adset, chosen by array position, priced at a
     * straight loss. And now that lambda is floored at 1, a total below the
     * budget is the correct answer rather than an error to patch over.
     */
    const sum = [...spends.values()].reduce((acc, s) => acc + s, 0);
    const residual = total - sum;
    const roundingOnly = Math.abs(residual) <= Math.max(1e-6, total * 1e-9);
    if (residual !== 0 && roundingOnly) {
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
  let members = solvable;
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
    if (spend <= 0) return sum;
    return sum + valueAt(a.curve, spend) * valueOf(a) - spend;
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
  options: { valuePerConversion?: number; minPerAdset?: number },
): Reallocation {
  const { valuePerConversion, minPerAdset } = options;

  /**
   * The current spends are the one input this function cannot second-guess:
   * they define the budget, and the budget is the ceiling the whole guarantee
   * rests on. `Math.max(0, NaN)` is `NaN`, so a single unparsed figure used to
   * poison the total and come back out as a move for the seller to act on.
   *
   * If we cannot read what they are spending today we do not get to say what
   * they should spend tomorrow, so this reports nothing rather than guessing.
   */
  const readable = adsets.every((a) => Number.isFinite(a.spend) && a.spend >= 0);
  if (!readable || adsets.length === 0) {
    return {
      budget: 0,
      currentProfit: 0,
      bestProfit: 0,
      gain: 0,
      best: adsets.map((a) => ({ id: a.id, spend: 0 })),
      moves: [],
    };
  }

  const budget = adsets.reduce((sum, a) => sum + a.spend, 0);

  // Each entity is priced in its own margin. A broom campaign and a blender
  // campaign share the wallet but not the value of a sale.
  const valueOf = (a: FundedAdset): number => a.valuePerConversion ?? valuePerConversion ?? NaN;
  const profitOf = (a: FundedAdset, spend: number) => {
    const value = valueOf(a);
    if (!Number.isFinite(value) || value <= 0 || spend <= 0) return 0;
    return valueAt(a.curve, spend) * value - spend;
  };

  const currentProfit = adsets.reduce((sum, a) => sum + profitOf(a, a.spend), 0);

  const best = allocate(
    adsets.map(({ id, curve, valuePerConversion: v }) => ({
      id,
      curve,
      ...(v === undefined ? {} : { valuePerConversion: v }),
    })),
    {
      budget,
      ...(valuePerConversion === undefined ? {} : { valuePerConversion }),
      ...(minPerAdset ? { minPerAdset } : {}),
    },
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

  // Dropping the small moves must not drop the money in them. Whatever the
  // filter removed is folded into the largest surviving move, so what the seller
  // is shown still balances — the alternative is a list that quietly loses a
  // real a day per adset and claims to sum to zero.
  if (moves.length > 0) {
    const shownDelta = moves.reduce((sum, m) => sum + m.delta, 0);
    const allDelta = best.split.reduce(
      (sum, s) => sum + (s.spend - Math.max(0, adsets.find((a) => a.id === s.id)?.spend ?? 0)),
      0,
    );
    const dropped = allDelta - shownDelta;
    if (dropped !== 0) {
      const biggest = moves[0]!;
      biggest.delta += dropped;
      biggest.to = biggest.from + biggest.delta;
    }
  }

  return {
    budget,
    currentProfit,
    bestProfit: best.profit,
    gain,
    best: best.split,
    moves,
  };
}

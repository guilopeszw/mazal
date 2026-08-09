// ─── packages/engine/src/predict.ts ──────────────────────────────────────
// The pre-flight answer: is this product worth launching at all?
//
// ROAS = (cvr × aov) / cpc, with cpc = cpm / (1000 × ctr).
//
// Not A-engine.md's five-way chain: see the note in roasAt. The point is not
// the midpoint. It is that the number is *decomposable* — ROAS
// is a product of factors, so when the band sits below break-even you can say
// which factor is dragging it there, and that is the recommendation.

import type { CampaignDay, Distribution, PredictInput, Verdict } from '@mazal/contracts';
import { aggregate, atcRate, aov, ctr, cvr, icRate } from '@mazal/contracts/metrics';
import type { Quantiles } from './index.ts';

/**
 * Deterministic three-point evaluation rather than 5,000 Monte Carlo samples.
 *
 * docs/plan/A-engine.md names this as the sanctioned trade: "replace it with a
 * deterministic three-point evaluation — each factor at p25, median, p75 — same
 * output shape, same visual". It is taken up front rather than at the end of the
 * cut ladder for a reason worth more than the sampling: it is **reproducible**.
 * A seller who re-runs a verdict and sees a different band stops trusting the
 * band, and a judge who re-runs the demo sees the number from the slide.
 */
type Quantile = 'p25' | 'median' | 'p75';

/** The five factors ROAS decomposes into. */
const FACTORS = ['ctr', 'atcRate', 'icRate', 'cvr', 'aov'] as const;
type Factor = (typeof FACTORS)[number];

const OBSERVE: Record<Factor, (d: CampaignDay) => number> = {
  ctr, atcRate, icRate, cvr, aov,
};

/**
 * Days of history before the campaign's own numbers count as evidence. Below
 * this the band does not move at all: a band that narrows on two days of data
 * is a false precision, and claim 9 in docs/acceptance.md is specifically about
 * *not* producing one.
 */
const MIN_HISTORY_DAYS = 7;

/**
 * Prior strength, in days. The category benchmark is treated as worth two weeks
 * of this seller's own data, so a fortnight of history moves the centre halfway
 * and a month moves it two thirds of the way.
 */
const PRIOR_DAYS = 14;

/**
 * Shrinks a category prior toward what this account actually did.
 *
 * The centre moves by the weight of the evidence, and the spread contracts by
 * the square root of it — the standard precision-weighted result, and the reason
 * the band is *strictly* narrower with history than without. That narrowing is
 * the whole of claim 9: "with thin data the band is wide, Mazal says so, and it
 * names which number to instrument first."
 */
function shrink(prior: Distribution, observed: number, days: number): Quantiles {
  if (days < MIN_HISTORY_DAYS) return prior;

  const w = days / (days + PRIOR_DAYS);
  const median = prior.median * (1 - w) + observed * w;
  const scale = Math.sqrt(PRIOR_DAYS / (days + PRIOR_DAYS));

  return {
    median,
    p25: median - (prior.median - prior.p25) * scale,
    p75: median + (prior.p75 - prior.median) * scale,
  };
}

export function predict(input: PredictInput): Verdict {
  const m = input.table[input.card.category].metrics;
  const breakEvenRoas = 1 / input.card.grossMargin;

  const history = input.history ?? [];
  const days = history.length;
  // aggregate() first, then the rate once — never the mean of daily rates.
  const total = days > 0 ? aggregate(history) : null;

  const factors = Object.fromEntries(
    FACTORS.map((f) => [f, total ? shrink(m[f], OBSERVE[f](total), days) : m[f]]),
  ) as Record<Factor, Quantiles>;

  /**
   * ROAS at the median of every factor. The centre is unambiguous — a product of
   * medians is the median of the product for factors this well behaved.
   */
  const centre = (() => {
    const clickRate = factors.ctr.median;
    if (clickRate <= 0) return 0;
    const cpc = m.cpm.median / (1000 * clickRate);
    return cpc === 0 ? 0 : Math.max((factors.cvr.median * factors.aov.median) / cpc, 0);
  })();

  /**
   * The band is built in log space, and this is a correction rather than a
   * refinement.
   *
   * Evaluating every factor at p75 at once and calling the result p90 is what
   * the three-point method literally says, and it is wrong: the quantile of a
   * product is not the product of the quantiles. Five factors each at their own
   * p75 is a joint event of roughly one in a thousand, not one in ten. It put a
   * p90 of 23x ROAS on the screen, which is the kind of number that loses a room
   * — and the frontend was right to refuse to render it.
   *
   * Independent factors add in log-variance, not in log-spread, so the honest
   * width is the root of the sum of squares of each factor's own log spread.
   */
  const logSpread = (q: Quantiles): number => {
    if (q.median <= 0 || q.p75 <= 0 || q.p25 <= 0) return 0;
    // 1.349, the same constant `spread()` uses on the funnel side: p25 and p75
    // sit 1.349 sigma apart, not 2. Halving the interquartile range gives
    // 0.6745 sigma, and treating that as sigma made a band labelled p10-p90
    // about a p19-p81 — narrower than it claims, which is the same kind of
    // error as the p99 it replaced, in the other direction.
    return (Math.log(q.p75) - Math.log(q.p25)) / 1.349;
  };

  const spreads = [
    logSpread(factors.cvr),
    logSpread(factors.aov),
    logSpread(factors.ctr),   // enters through cpc
    logSpread(m.cpm),         // enters through cpc
  ];
  const width = Math.sqrt(spreads.reduce((sum, x) => sum + x * x, 0));

  // 1.2816 sigma is the 90th percentile of a standard normal.
  const Z = 1.2816;
  const predictedRoas = {
    p10: Math.max(centre * Math.exp(-Z * width), 0),
    p50: centre,
    p90: centre * Math.exp(Z * width),
  };


  /**
   * The factor dragging the band down — claim 8 wants it named on every verdict,
   * not only on the ones that launch.
   *
   * With history it is the factor furthest below its category median, because
   * that is a real deficit this account has. Without history nothing is known to
   * be deficient, so it is the widest factor instead: the one whose uncertainty
   * is doing the most to keep the band wide, and therefore the one to instrument
   * first. Those are different questions and the answer says which it answered.
   */
  const limitingFactor = ((): string => {
    if (total) {
      const worst = FACTORS.reduce((a, b) => {
        const ratio = (f: Factor) => (m[f].median === 0 ? 1 : OBSERVE[f](total) / m[f].median);
        return ratio(b) < ratio(a) ? b : a;
      });
      const pct = Math.round((OBSERVE[worst](total) / m[worst].median) * 100);

      // Only call a factor a culprit when it is actually behind. An account
      // sitting at 99% of the median on its worst factor has nothing dragging
      // it down, and naming one anyway puts a false claim on the seller's
      // screen — the band is wide there because the category is wide.
      if (pct >= 90) {
        return `every factor is at or near the category median — the band is limited by category spread, not by this account`;
      }
      return `${worst} is at ${pct}% of the category median — the factor holding this band down`;
    }

    const widest = FACTORS.reduce((a, b) => {
      const rel = (f: Factor) => (m[f].median === 0 ? 0 : (m[f].p75 - m[f].p25) / m[f].median);
      return rel(b) > rel(a) ? b : a;
    });
    return `no campaign history yet, so the band is category-wide — instrument ${widest} first, it is the widest factor here`;
  })();

  if (predictedRoas.p90 < breakEvenRoas) {
    return { decision: 'dont_launch', predictedRoas, breakEvenRoas, limitingFactor };
  }
  if (predictedRoas.p10 > breakEvenRoas) {
    return { decision: 'launch', predictedRoas, breakEvenRoas, limitingFactor };
  }

  // Straddling break-even. The seller launches small, and is told the number
  // that means stop — an untriggered "launch small" is how a test budget
  // becomes a real one nobody decided to spend.
  return {
    decision: 'launch_small',
    predictedRoas,
    breakEvenRoas,
    limitingFactor,
    // `limitingFactor` is written to sit mid-sentence, so it starts lowercase.
    // Appending it after a full stop gave "…after 100 clicks. no campaign
    // history yet…" — on the first line of the demo.
    killTrigger:
      `Stop if ROAS is below ${breakEvenRoas.toFixed(2)} after 100 clicks. ` +
      `${limitingFactor.charAt(0).toUpperCase()}${limitingFactor.slice(1)}.`,
  };
}

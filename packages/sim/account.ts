// ─── packages/sim/account.ts ─────────────────────────────────────────────
// A seller with several products and one wallet.
//
// `generateCampaign` makes one campaign at a flat daily budget, which is the
// right shape for the diagnostic engine — it asks "what broke", and a broken
// funnel shows up at any budget. The Allocator asks a different question, and a
// flat budget cannot answer it: a campaign that only ever spent R$100 contains
// no evidence about R$50 or R$200. `fitCurve` says so now, and refuses.
//
// Two things this adds that the campaign generator does not have.
//
// ## Diminishing returns, from auction pressure rather than by decree
//
// The campaign generator has none: `impressions = spend / cpm × 1000` is linear,
// so doubling the budget doubles the purchases forever. That is fine for
// diagnosis and useless for allocation — there is no curve to find.
//
// Rather than bolt a saturation term onto the output, this models the cause.
// Spending more into the same audience buys progressively more expensive
// impressions, because the cheap inventory goes first:
//
//     cpm(s) = baseCpm · (1 + s/K)
//
// which makes the impressions a seller actually gets
//
//     I(s) = 1000·s / cpm(s) = (1000K/baseCpm) · s/(K + s)
//
// exactly the Hill form the engine fits, with α = 1. So the truth the Allocator
// is trying to recover is not injected as a curve — it falls out of one line of
// auction economics, and `K` is a real quantity: the daily spend at which a
// seller is paying double the base CPM.
//
// ## A budget that moved
//
// Each product's daily spend walks across a range wide enough to identify the
// curve. That is not a convenience for the fitter: it is what a seller who has
// ever tested a budget actually looks like, and a seller who has not is one the
// Allocator honestly cannot help yet.

import type { CampaignDay, ProductCard } from '@mazal/contracts';
import { addDays } from './funnel.ts';
import { makeRng, type Rng } from './rng.ts';
import { sampleStore } from './store.ts';

/** The response curve the account was generated from, in engine units. */
export type TrueCurve = {
  /** Conversions per day the product would reach at unlimited spend. */
  vMax: number;
  /** Daily spend at half that — and where CPM has doubled. */
  k: number;
  /** Reais of margin per conversion: price × grossMargin. */
  valuePerConversion: number;
};

export type AccountProduct = {
  id: string;
  card: ProductCard;
  days: CampaignDay[];
  /** What the seller spends today, before any advice. */
  currentSpend: number;
  /** Ground truth. Never handed to the engine — only used to score it. */
  truth: TrueCurve;
};

export type LabelledAccount = {
  products: AccountProduct[];
  /** The wallet: what the seller spends across everything, per day. */
  budget: number;
};

const PRIOR = { cpm: 22, ctr: 0.011, atcRate: 0.08, icRate: 0.45, purchaseRate: 0.583 } as const;

function stochasticRound(rng: Rng, x: number): number {
  const floor = Math.floor(x);
  return floor + (rng.float() < x - floor ? 1 : 0);
}

/**
 * Daily spends that actually move.
 *
 * A stepped walk rather than noise around a mean: sellers change a budget and
 * leave it for a while, so the record is a handful of plateaus. That also gives
 * the fit several distinct spend levels rather than one cloud, which is what
 * makes `k` identifiable at all.
 */
function spendSchedule(rng: Rng, centre: number, days: number): number[] {
  const levels = [0.4, 0.7, 1.0, 1.5, 2.2].map((f) => centre * f);
  const out: number[] = [];
  let i = rng.int(0, levels.length - 1);
  let held = 0;
  for (let d = 0; d < days; d++) {
    if (held >= rng.int(3, 6)) {
      // Step to a neighbour, so the walk is a seller adjusting rather than
      // jumping at random.
      i = Math.max(0, Math.min(levels.length - 1, i + (rng.float() < 0.5 ? -1 : 1)));
      held = 0;
    }
    held++;
    out.push(levels[i]! * rng.lognormal(1, 0.06));
  }
  return out;
}

/**
 * One product's flight, simulated through the auction.
 *
 * Every stage below the click is untouched by spend — this models a healthy
 * funnel whose only constraint is what the media costs. A broken funnel is the
 * other generator's job, and mixing the two would make it impossible to say
 * whether a flat curve meant saturation or a leak.
 */
function simulateProduct(rng: Rng, card: ProductCard, days: number, startDate: string) {
  const baseCpm = PRIOR.cpm * rng.lognormal(1, 0.25);
  const ctr = PRIOR.ctr * rng.lognormal(1, 0.3);
  const atcRate = PRIOR.atcRate * rng.lognormal(1, 0.3);
  const icRate = PRIOR.icRate * rng.lognormal(1, 0.2);
  const purchaseRate = PRIOR.purchaseRate * rng.lognormal(1, 0.15);

  // Where the auction starts to bite. Smaller K = saturates sooner.
  const k = rng.lognormal(140, 0.5);
  const centre = rng.lognormal(90, 0.45);
  const schedule = spendSchedule(rng, centre, days);

  const campaignId = `sim-acct-${rng.int(100000, 999999)}`;
  const rows: CampaignDay[] = [];

  for (let d = 0; d < days; d++) {
    const spend = schedule[d]!;
    // The whole saturation story, in one line.
    const cpm = baseCpm * (1 + spend / k) * rng.lognormal(1, 0.08);
    const impressions = Math.max(0, Math.round((spend / cpm) * 1000));

    const noise = () => rng.lognormal(1, 0.12);
    const step = (upstream: number, rate: number) =>
      Math.min(upstream, stochasticRound(rng, upstream * rate * noise()));

    const clicks = step(impressions, ctr);
    const addToCarts = step(clicks, atcRate);
    const checkoutsInitiated = step(addToCarts, icRate);
    const purchases = step(checkoutsInitiated, purchaseRate);
    const aov = (card.price + card.shippingCost) * rng.lognormal(1, 0.1);

    rows.push({
      date: addDays(startDate, d),
      campaignId,
      spend: Math.round(spend * 100) / 100,
      impressions,
      reach: Math.round(impressions * 0.72),
      clicks,
      addToCarts,
      checkoutsInitiated,
      purchases,
      revenue: Math.round(purchases * aov * 100) / 100,
    });
  }

  // Conversions per real of impression, all the way down the funnel.
  const perImpression = ctr * atcRate * icRate * purchaseRate;
  const truth: TrueCurve = {
    // I(s) → 1000K/baseCpm as s grows, so conversions ceil at that times the rate.
    vMax: ((1000 * k) / baseCpm) * perImpression,
    k,
    valuePerConversion: card.price * card.grossMargin,
  };

  return { rows, truth, currentSpend: schedule[days - 1]! };
}

/**
 * A seller with `count` products, each with its own margin and its own curve.
 *
 * The current spends are deliberately *not* the optimum — they are where the
 * seller's own budget walk happened to end. That is the point of the feature:
 * the money is already somewhere, and the question is whether it is in the right
 * place.
 */
/**
 * Is this a product a seller could advertise at all?
 *
 * At the published priors a purchase costs about R$95 of media — CPM 22 over
 * 2.31e-4 purchases per impression. A R$35 broom at a 24% margin returns R$8.40
 * a sale, so it loses money at every budget, and the first version of this
 * generator produced accounts where 60% had no profitable spend anywhere. That
 * is not a bug in the priors: most cheap Olist items genuinely cannot pay for
 * Meta ads, which is worth knowing and is `predict`'s job to say.
 *
 * But an account with nothing profitable in it has nothing to allocate, so the
 * Allocator's own scoring would be dividing by a negative. This generator makes
 * accounts belonging to sellers who ARE viable advertisers: the first real must
 * earn back more than itself, with enough headroom that the optimum is a real
 * spend rather than zero.
 */
const VIABLE_MARGINAL = 1.4;

const marginalAtZero = (t: TrueCurve) => (t.valuePerConversion * t.vMax) / t.k;

export function generateAccount(
  seed: number,
  { products = 3, days = 30, startDate = '2026-07-01' } = {},
): LabelledAccount {
  const rng = makeRng(seed);
  const out: AccountProduct[] = [];

  for (let i = 0; i < products; i++) {
    let attempt = 0;
    let made = null as ReturnType<typeof simulateProduct> | null;
    let card = sampleStore(rng);

    // Resample rather than rescale: a product that cannot pay is a real thing,
    // and quietly inflating its funnel until it can would teach the engine a
    // relationship that does not hold. Bounded, so a bad seed cannot hang.
    while (attempt < 40) {
      const candidate = simulateProduct(rng, card, days, startDate);
      if (marginalAtZero(candidate.truth) >= VIABLE_MARGINAL) {
        made = candidate;
        break;
      }
      card = sampleStore(rng);
      attempt++;
    }
    if (!made) continue;

    out.push({ id: `${card.category}-${i + 1}`, card, days: made.rows, currentSpend: made.currentSpend, truth: made.truth });
  }

  return {
    products: out,
    budget: out.reduce((sum, p) => sum + p.currentSpend, 0),
  };
}

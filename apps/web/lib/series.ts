import type { CampaignDay } from "@mazal/contracts";

/**
 * The daily series behind the mock. `demo-script.md` §5 describes Case #2 exactly: two good
 * weeks, then add-to-cart falls off a cliff on the 12th while everything upstream keeps
 * working — *"people are still clicking."* So clicks and impressions hold steady across the
 * change point and only the add-to-cart rate moves. A series where traffic also dropped
 * would be a different diagnosis, and the demo's whole point is that this one is not a
 * media problem.
 *
 * Counts, never rates: the contract stores `clicks` and `addToCarts`, and anything wanting
 * a rate calls `atcRate` from `@mazal/contracts/metrics`. This module hands out days.
 *
 * Deterministic on purpose — no RNG, so the demo renders the same pixels every run and a
 * screenshot taken on Saturday still matches the app on Sunday.
 */

export const CAMPAIGN_ID = "mazal-demo-furniture";
export const FIRST_DAY = "2026-07-01";
export const CHANGE_POINT = "2026-07-12";
const DAYS = 30;

const BASELINE_ATC_RATE = 0.068; // the two good weeks
const BROKEN_ATC_RATE = 0.004; // after the supplier ETA moved
const IC_OF_ATC = 0.45; // checkouts started per add-to-cart
const PURCHASE_OF_IC = 0.62;
const UNIT_PRICE = 105.82; // BRL, the product card's price
/**
 * Chosen so CPM lands on the category's published prior (~R$22) rather than 2.3× it. Stage 0
 * prints CONFORME on this sheet, and a CPM at twice its own reference under that word is a
 * contradiction a judge finds in four seconds.
 */
const CPC = 1.06; // BRL, steady — the auction did not change

const iso = (dayIndex: number): string => {
  const [y, m, d] = FIRST_DAY.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + dayIndex));
  return t.toISOString().slice(0, 10);
};

/**
 * Small integer counts cannot carry a 0.4% rate a day at a time — `Math.round(45 × 0.004)`
 * is 0 for thirty days running, and the series would read as a campaign with no funnel at
 * all rather than a broken one. Carrying the fractional remainder forward keeps the
 * aggregate honest while every emitted count stays a whole number.
 */
function accumulate(targets: number[]): number[] {
  // Starting at zero costs the first day half a unit and puts a dip at the left edge of the
  // chart that the data does not have. Half a unit of credit is the unbiased opening.
  let carry = 0.5;
  return targets.map((t) => {
    carry += t;
    const whole = Math.floor(carry);
    carry -= whole;
    return whole;
  });
}

/**
 * Case #1's campaign never breaks — it is bad from day one, which is a different shape and
 * a different diagnosis. Passing both rates equal and no change point gives that series.
 */
export function buildSeries(
  { before = BASELINE_ATC_RATE, after = BROKEN_ATC_RATE, changePoint = CHANGE_POINT as string | null } = {},
): CampaignDay[] {
  const dates = Array.from({ length: DAYS }, (_, i) => iso(i));

  // Steady traffic. The wobble is a fixed pattern, not noise, so the chart has a pulse
  // without the series changing between renders.
  const clicks = dates.map((_, i) => 44 + ((i * 7) % 5));
  const impressions = clicks.map((c) => c * 48); // CTR ~2.1%, unchanged throughout

  const isBroken = (date: string) => changePoint !== null && date >= changePoint;
  const addToCarts = accumulate(
    dates.map((date, i) => clicks[i]! * (isBroken(date) ? after : before)),
  );
  const checkoutsInitiated = accumulate(addToCarts.map((a) => a * IC_OF_ATC));
  const purchases = accumulate(checkoutsInitiated.map((c) => c * PURCHASE_OF_IC));

  return dates.map((date, i) => ({
    date,
    campaignId: CAMPAIGN_ID,
    spend: Math.round(clicks[i]! * CPC * 100) / 100,
    impressions: impressions[i]!,
    reach: Math.round(impressions[i]! / 1.4),
    clicks: clicks[i]!,
    addToCarts: addToCarts[i]!,
    checkoutsInitiated: checkoutsInitiated[i]!,
    purchases: purchases[i]!,
    revenue: Math.round(purchases[i]! * UNIT_PRICE * 100) / 100,
  }));
}

/** Days strictly before the break, and days from the break onward. */
export function splitAtChangePoint(days: CampaignDay[], changePoint = CHANGE_POINT) {
  return {
    baseline: days.filter((d) => d.date < changePoint),
    broken: days.filter((d) => d.date >= changePoint),
  };
}

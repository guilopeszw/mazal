// ─── packages/meta/src/fold.ts ───────────────────────────────────────────

import type { CampaignDay } from '@mazal/contracts';
import { fromCents, toCents } from './numbers.ts';

/**
 * Sum rows that share a date into one day.
 *
 * Needed twice, for the same reason both times: a row is one entity on one day,
 * and the funnel a seller asks about is the whole account on that day.
 *
 * It also fixes something that predates this package. `parseMetaCsv` emits one
 * `CampaignDay` per CSV **row**, and an Ads Manager export broken out by ad set
 * has one row per ad set per day. Three ad sets over thirty days arrives as
 * ninety "days", so `diagnose`'s seven-day window covers two real days and a
 * third — and it says nothing about that, because from inside the engine those
 * ninety rows look like ninety days.
 *
 * Money is summed in cents (see `numbers.ts`). `campaignId` is taken from the
 * first row of each date, and `sessions`/`bounceRate` are dropped: they are
 * per-session analytics that no Meta export carries, and summing them across
 * entities would invent a number.
 */
export function foldDaysByDate(days: CampaignDay[]): CampaignDay[] {
  type Folded = Omit<CampaignDay, 'spend' | 'revenue'> & { spendCents: number; revenueCents: number };
  const byDate = new Map<string, Folded>();

  for (const day of days) {
    const found = byDate.get(day.date);
    if (!found) {
      // Built field by field rather than spread, so `sessions` and `bounceRate`
      // cannot ride along: they are per-session analytics, no Meta export
      // carries them, and summing them across entities would invent a number.
      byDate.set(day.date, {
        date: day.date,
        campaignId: day.campaignId,
        spendCents: toCents(day.spend),
        impressions: day.impressions,
        reach: day.reach,
        clicks: day.clicks,
        addToCarts: day.addToCarts,
        checkoutsInitiated: day.checkoutsInitiated,
        purchases: day.purchases,
        revenueCents: toCents(day.revenue),
      });
      continue;
    }

    found.spendCents += toCents(day.spend);
    found.revenueCents += toCents(day.revenue);
    found.impressions += day.impressions;
    found.reach += day.reach;
    found.clicks += day.clicks;
    found.addToCarts += day.addToCarts;
    found.checkoutsInitiated += day.checkoutsInitiated;
    found.purchases += day.purchases;
  }

  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(({ spendCents, revenueCents, ...rest }) => ({
      ...rest,
      spend: fromCents(spendCents),
      revenue: fromCents(revenueCents),
    }));
}

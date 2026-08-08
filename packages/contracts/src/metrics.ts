// ─── packages/contracts/src/metrics.ts ────────────────────────────────────
// The only arithmetic vocabulary in the codebase.
// Every rate is derived here. No ctr, cvr, roas, or atcRate field exists
// in any type — import these functions instead.

import type { CampaignDay } from './index.ts';

/** Returns 0 for 0/0 rather than NaN. NaN propagates silently through the engine; 0 does not. */
export const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

/** Sums a window of days into one CampaignDay so every rate function works on ranges too. */
export const aggregate = (days: CampaignDay[]): CampaignDay => {
  const sum: CampaignDay = {
    date: days.at(-1)?.date ?? '',
    campaignId: days[0]?.campaignId ?? '',
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    addToCarts: 0,
    checkoutsInitiated: 0,
    purchases: 0,
    revenue: 0,
  };

  for (const d of days) {
    sum.spend += d.spend;
    sum.impressions += d.impressions;
    sum.reach += d.reach;
    sum.clicks += d.clicks;
    sum.addToCarts += d.addToCarts;
    sum.checkoutsInitiated += d.checkoutsInitiated;
    sum.purchases += d.purchases;
    sum.revenue += d.revenue;

    // Optional fields: sum only when present
    if (d.sessions !== undefined) {
      sum.sessions = (sum.sessions ?? 0) + d.sessions;
    }
    // bounceRate is a rate, not a count — we do not sum it.
    // Consumers who need aggregate bounce rate should compute it from sessions data.
  }

  return sum;
};

// ─── rate functions ──────────────────────────────────────────────────────
// Each takes a CampaignDay (or an aggregated one) and derives a rate.

export const ctr       = (d: CampaignDay): number => safeDiv(d.clicks, d.impressions);
export const cpc       = (d: CampaignDay): number => safeDiv(d.spend, d.clicks);
export const cpm       = (d: CampaignDay): number => safeDiv(d.spend * 1000, d.impressions);
export const atcRate   = (d: CampaignDay): number => safeDiv(d.addToCarts, d.clicks);
export const icRate    = (d: CampaignDay): number => safeDiv(d.checkoutsInitiated, d.addToCarts);
export const cvr       = (d: CampaignDay): number => safeDiv(d.purchases, d.clicks);
export const cpa       = (d: CampaignDay): number => safeDiv(d.spend, d.purchases);
export const aov       = (d: CampaignDay): number => safeDiv(d.revenue, d.purchases);
export const roas      = (d: CampaignDay): number => safeDiv(d.revenue, d.spend);
export const costPerAtc = (d: CampaignDay): number => safeDiv(d.spend, d.addToCarts);

import { expect, test } from 'vitest';
import { ACTION_ALIASES } from './types.ts';
import { fromMetaInsights } from './adapter.ts';

/**
 * The payload's vocabulary, checked against Meta's published reference.
 *
 * A review found the real limitation of this package's other gate: it runs
 * `fromMetaInsights` over a payload `generate.ts` just wrote, so it proves the
 * adapter and the generator agree with each other, not that either agrees with
 * the Graph API. Both were written by the same person on the same afternoon.
 *
 * This narrows that gap from one side. Every field name the adapter reads is
 * pinned here against the field list Meta documents for the Ads Insights edge,
 * transcribed on 2026-08-09 from:
 *
 *   https://developers.facebook.com/docs/marketing-api/insights/
 *   https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/
 *   https://developers.facebook.com/docs/graph-api/reference/adgroup/insights/
 *
 * **What this does not do.** It checks names, not behaviour. Whether a value
 * arrives as `"12"` or `12`, whether an empty `actions` is omitted or sent as
 * `[]`, and whether three purchase aliases carry the same conversion are all
 * assumptions this file cannot confirm — they are what a single real response
 * would settle, and nobody on the team has run one. That remains the honest
 * hole, it is in `docs/HANDOFF.md` as the next action, and it takes ten minutes
 * for whoever has an ad account.
 */

/** Transcribed from the Ads Insights reference. Not exhaustive on video metrics. */
const DOCUMENTED_FIELDS = new Set([
  'account_currency', 'account_id', 'account_name',
  'action_values', 'actions', 'actions_per_impression',
  'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'async_percent_completion', 'async_status',
  'call_to_action_clicks', 'campaign_id', 'campaign_name',
  'cost_per_action_type', 'cost_per_inline_link_click',
  'cost_per_inline_post_engagement', 'cost_per_total_action', 'cost_per_unique_click',
  'cpm', 'cpp', 'ctr', 'clicks',
  'date_start', 'date_stop', 'frequency', 'id',
  'impressions', 'inline_link_clicks', 'inline_post_engagement',
  'objective', 'product_id', 'reach', 'relevance_score', 'report_run_id',
  'social_clicks', 'social_impressions', 'social_reach', 'spend',
  'total_action_value', 'total_actions', 'total_unique_actions',
  'unique_clicks', 'unique_ctr', 'unique_social_clicks',
]);

/** Every field this package reads out of a row. Kept by hand, checked below. */
const FIELDS_WE_READ = [
  'date_start',
  'date_stop',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'account_id',
  'account_currency',
  'spend',
  'impressions',
  'reach',
  'inline_link_clicks',
  'actions',
  'action_values',
] as const;

test('every field the adapter reads is one Meta documents', () => {
  for (const field of FIELDS_WE_READ) {
    expect(DOCUMENTED_FIELDS.has(field), `${field} is not in Meta's documented field list`).toBe(true);
  }
});

test('the adapter reads no field that is a rate', () => {
  // Meta publishes ctr, cpc, cpm, cpp and frequency, and the contract's rule is
  // that rates are derived and never stored. This is that rule checked against
  // the real vocabulary rather than against our own type: if someone adds `ctr`
  // to the row we read, this fails before a second definition of CTR exists.
  const RATES = ['ctr', 'cpc', 'cpm', 'cpp', 'frequency', 'unique_ctr', 'cost_per_action_type'];
  for (const rate of RATES) {
    expect(FIELDS_WE_READ as readonly string[]).not.toContain(rate);
  }
});

test('clicks come from inline_link_clicks, not from clicks', () => {
  // Both are documented and they are different numbers: `clicks` counts every
  // click on the ad, `inline_link_clicks` only the ones that went to the site.
  // The contract's `CampaignDay.clicks` is the second — "link clicks, not all
  // clicks" — and reading the wrong one inflates every downstream rate.
  expect(FIELDS_WE_READ as readonly string[]).toContain('inline_link_clicks');
  expect(FIELDS_WE_READ as readonly string[]).not.toContain('clicks');
});

test('the action types we accept are the documented ones', () => {
  // `offsite_conversion.fb_pixel_*` is the pixel form and appears verbatim in
  // Meta's conversion-tracking docs; `omni_*` is the cross-channel form. They
  // are alternative views of one conversion, which is why the adapter takes the
  // first present rather than summing them.
  expect(ACTION_ALIASES.purchases).toContain('purchase');
  expect(ACTION_ALIASES.purchases).toContain('omni_purchase');
  expect(ACTION_ALIASES.purchases).toContain('offsite_conversion.fb_pixel_purchase');
  expect(ACTION_ALIASES.addToCarts).toContain('offsite_conversion.fb_pixel_add_to_cart');
  expect(ACTION_ALIASES.checkoutsInitiated).toContain('offsite_conversion.fb_pixel_initiate_checkout');
});

test('a row carrying the documented rate fields is read without them', () => {
  // The end-to-end version of the rule: a response with every rate Meta sends
  // still produces a day with only counts and money on it.
  const [day] = fromMetaInsights({
    data: [
      {
        date_start: '2026-07-01',
        date_stop: '2026-07-01',
        campaign_id: '23851',
        campaign_name: 'Relógios',
        account_currency: 'BRL',
        spend: '256.62',
        impressions: '13505',
        reach: '11743',
        inline_link_clicks: '141',
        clicks: '620',
        ctr: '1.04',
        cpc: '1.82',
        cpm: '19.00',
        cpp: '21.85',
        frequency: '1.15',
        objective: 'OUTCOME_SALES',
        actions: [{ action_type: 'purchase', value: '4' }],
        action_values: [{ action_type: 'purchase', value: '794.12' }],
      },
    ],
  }).total;

  expect(Object.keys(day!).sort()).toEqual(
    [
      'addToCarts', 'campaignId', 'checkoutsInitiated', 'clicks', 'date',
      'impressions', 'purchases', 'reach', 'revenue', 'spend',
    ].sort(),
  );
  // 141 link clicks, not the 620 clicks on the ad.
  expect(day!.clicks).toBe(141);
});

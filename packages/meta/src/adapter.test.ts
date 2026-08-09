import { expect, test } from 'vitest';
import { fromMetaInsights } from './adapter.ts';
import { MetaInsightsError } from './errors.ts';
import type { MetaInsightsPayload, MetaInsightsRow } from './types.ts';

const row = (over: Partial<MetaInsightsRow> = {}): MetaInsightsRow => ({
  date_start: '2026-07-01',
  date_stop: '2026-07-01',
  campaign_id: '23851',
  campaign_name: 'Relógios Q3',
  account_currency: 'BRL',
  spend: '256.62',
  impressions: '13505',
  reach: '11743',
  inline_link_clicks: '141',
  actions: [
    { action_type: 'add_to_cart', value: '17' },
    { action_type: 'initiate_checkout', value: '7' },
    { action_type: 'purchase', value: '4' },
  ],
  action_values: [{ action_type: 'purchase', value: '794.12' }],
  ...over,
});

const payload = (...rows: MetaInsightsRow[]): MetaInsightsPayload => ({ data: rows });

test('reads a row into the contract, counts and money only', () => {
  const { total, entities, currency } = fromMetaInsights(payload(row()));

  expect(total).toEqual([
    {
      date: '2026-07-01',
      campaignId: '23851',
      spend: 256.62,
      impressions: 13505,
      reach: 11743,
      clicks: 141,
      addToCarts: 17,
      checkoutsInitiated: 7,
      purchases: 4,
      revenue: 794.12,
    },
  ]);
  expect(currency).toBe('BRL');
  expect(entities).toHaveLength(1);
  expect(entities[0]!.level).toBe('campaign');
});

test('stores no rate, whatever Meta sends alongside', () => {
  // Meta really does return ctr, cpc, cpm and frequency. The contract's rule is
  // that rates are derived, never stored, and this is the boundary where a
  // stored rate would get in.
  const withRates = { ...row(), ctr: '2.14', cpc: '0.69', cpm: '14.74', frequency: '1.15' };
  const [day] = fromMetaInsights(payload(withRates as MetaInsightsRow)).total;

  expect(Object.keys(day!).sort()).toEqual(
    [
      'addToCarts',
      'campaignId',
      'checkoutsInitiated',
      'clicks',
      'date',
      'impressions',
      'purchases',
      'reach',
      'revenue',
      'spend',
    ].sort(),
  );
});

test('an absent field is refused, not read as zero', () => {
  const { spend: _dropped, ...noSpend } = row();

  try {
    fromMetaInsights(payload(noSpend as MetaInsightsRow));
    throw new Error('expected a refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(MetaInsightsError);
    const e = error as MetaInsightsError;
    expect(e.code).toBe('META_INSIGHTS_INCOMPLETE');
    expect(e.missing[0]!.fields).toContain('spend');
    expect(e.missing[0]!.date).toBe('2026-07-01');
    expect(e.message).toContain('Absence is not zero');
  }
});

test('an empty value is the same refusal as a missing one', () => {
  for (const empty of ['', '—', 'N/A']) {
    expect(() => fromMetaInsights(payload(row({ spend: empty })))).toThrow(MetaInsightsError);
  }
});

test('an empty actions array is a real zero, because a quiet day carries no action type', () => {
  const [day] = fromMetaInsights(payload(row({ actions: [], action_values: [] }))).total;

  expect(day!.addToCarts).toBe(0);
  expect(day!.purchases).toBe(0);
  expect(day!.revenue).toBe(0);
  // And the spend on that day is still real: the day happened, it just sold nothing.
  expect(day!.spend).toBe(256.62);
});

test('a missing actions key is a hole, and is refused', () => {
  const { actions: _dropped, ...noActions } = row();
  expect(() => fromMetaInsights(payload(noActions as MetaInsightsRow))).toThrow(MetaInsightsError);
});

test('reads the prefixed aliases a real account emits', () => {
  const [day] = fromMetaInsights(
    payload(
      row({
        actions: [
          { action_type: 'offsite_conversion.fb_pixel_add_to_cart', value: '17' },
          { action_type: 'omni_initiated_checkout', value: '7' },
          { action_type: 'omni_purchase', value: '4' },
        ],
        action_values: [{ action_type: 'omni_purchase', value: '794.12' }],
      }),
    ),
  ).total;

  expect(day!.addToCarts).toBe(17);
  expect(day!.checkoutsInitiated).toBe(7);
  expect(day!.purchases).toBe(4);
  expect(day!.revenue).toBe(794.12);
});

test('an action type we do not read is ignored and said out loud', () => {
  const account = fromMetaInsights(
    payload(
      row({
        actions: [
          { action_type: 'add_to_cart', value: '17' },
          { action_type: 'initiate_checkout', value: '7' },
          { action_type: 'purchase', value: '4' },
          { action_type: 'landing_page_view', value: '900' },
        ],
      }),
    ),
  );

  // 900 landing page views must not land in any funnel count.
  expect(account.total[0]!.clicks).toBe(141);
  expect(account.warnings.some((w) => w.includes('landing_page_view'))).toBe(true);
});

test('sums entities into the account day, and keeps them separately', () => {
  const account = fromMetaInsights(
    payload(
      row({ adset_id: 'a1', adset_name: 'Lookalike', spend: '100.01', inline_link_clicks: '50' }),
      row({ adset_id: 'a2', adset_name: 'Retargeting', spend: '156.61', inline_link_clicks: '91' }),
    ),
  );

  expect(account.entities.map((e) => e.name)).toEqual(['Lookalike', 'Retargeting']);
  expect(account.entities.every((e) => e.level === 'adset')).toBe(true);
  // 100.01 + 156.61 in floats is 256.62000000000003. In cents it is 256.62.
  expect(account.total[0]!.spend).toBe(256.62);
  expect(account.total[0]!.clicks).toBe(141);
  expect(account.warnings.some((w) => w.includes('Reach was summed'))).toBe(true);
});

test('drops an aggregated row rather than reading a range as a day', () => {
  const account = fromMetaInsights(payload(row(), row({ date_start: '2026-07-01', date_stop: '2026-07-07' })));

  expect(account.total).toHaveLength(1);
  expect(account.warnings.some((w) => w.includes('Dropped aggregated row'))).toBe(true);
});

test('says when it has only the first page', () => {
  const account = fromMetaInsights({ ...payload(row()), paging: { next: 'https://graph.facebook.com/...' } });
  expect(account.warnings.some((w) => w.includes('paginated'))).toBe(true);
});

test('carries the fixture stamp through, and says so', () => {
  const account = fromMetaInsights({
    ...payload(row()),
    __mazal_fixture: {
      kind: 'fixture',
      generator: 'packages/meta/generate.ts',
      derivedFrom: 'packages/sim/fixtures/demo-case2.json',
      note: 'Synthetic.',
    },
  });

  expect(account.fixture?.derivedFrom).toBe('packages/sim/fixtures/demo-case2.json');
  expect(account.warnings.some((w) => w.includes('No Meta account was called'))).toBe(true);
});

test('a payload that is not an insights response is refused by name', () => {
  for (const bad of [null, undefined, {}, { data: 'nope' }, []]) {
    try {
      fromMetaInsights(bad);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as MetaInsightsError).code).toBe('META_INSIGHTS_MALFORMED');
    }
  }
});

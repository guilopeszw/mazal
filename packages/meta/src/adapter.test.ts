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

test('three aliases for one purchase are one purchase, not three', () => {
  // An account wired through the pixel and also reporting omni carries all
  // three rows with the same value, for the same sales. Summing them tripled
  // cvr and roas and cut cpa to a third — and left icRate correct, because both
  // its terms inflated together. The headline finding would still have read
  // right while the money under it was 3x wrong.
  const [day] = fromMetaInsights(
    payload(
      row({
        actions: [
          { action_type: 'purchase', value: '10' },
          { action_type: 'omni_purchase', value: '10' },
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '10' },
        ],
        action_values: [
          { action_type: 'purchase', value: '1000.00' },
          { action_type: 'omni_purchase', value: '1000.00' },
        ],
      }),
    ),
  ).total;

  expect(day!.purchases).toBe(10);
  expect(day!.revenue).toBe(1000);
});

test('says so when two aliases for one conversion disagree', () => {
  const account = fromMetaInsights(
    payload(
      row({
        actions: [
          { action_type: 'purchase', value: '10' },
          { action_type: 'omni_purchase', value: '4' },
        ],
      }),
    ),
  );

  // First alias wins, and the disagreement is reported rather than averaged or
  // silently picked: two numbers this far apart are not one event seen twice.
  expect(account.total[0]!.purchases).toBe(10);
  expect(account.warnings.some((w) => w.includes('disagreed'))).toBe(true);
});

test('an omitted actions key is Metas zero, not a hole', () => {
  // The Graph API omits an empty field instead of sending []. Refusing that
  // refused every campaign that had a day without a sale — which is most of
  // them, and all of them before their first order.
  const { actions: _a, action_values: _v, ...quiet } = row({ date_start: '2026-07-02', date_stop: '2026-07-02' });
  const { total } = fromMetaInsights(payload(row(), quiet as MetaInsightsRow));

  expect(total).toHaveLength(2);
  expect(total[1]!.purchases).toBe(0);
  expect(total[1]!.revenue).toBe(0);
  expect(total[1]!.spend).toBe(256.62);
});

test('refuses a payload where no row anywhere carries actions', () => {
  // The other reading of the same absence: a caller who never asked for
  // conversions in `fields`. Reading that as a funnel of zeros would report a
  // dead campaign to a seller who is selling.
  const { actions: _a, action_values: _v, ...noConversions } = row();

  try {
    fromMetaInsights(payload(noConversions as MetaInsightsRow));
    throw new Error('expected a refusal');
  } catch (error) {
    expect((error as MetaInsightsError).code).toBe('META_INSIGHTS_INCOMPLETE');
    expect((error as Error).message).toContain('not a campaign with no sales');
  }
});

test('one unreadable row is dropped and named, and does not take the month with it', () => {
  const days = Array.from({ length: 5 }, (_, i) =>
    row({ date_start: `2026-07-0${i + 1}`, date_stop: `2026-07-0${i + 1}` }),
  );
  days[2] = { ...days[2]!, spend: '' };

  const account = fromMetaInsights(payload(...days));

  expect(account.total).toHaveLength(4);
  expect(account.warnings.some((w) => w.includes('2026-07-03'))).toBe(true);
  // And the reason a gap matters is said, because `diagnose` reads the last
  // seven entries rather than the last seven dates.
  expect(account.warnings.some((w) => w.includes('calendar days'))).toBe(true);
});

test('refuses negative money, because the days door refuses it too', () => {
  const account = fromMetaInsights(
    payload(row(), row({ date_start: '2026-07-02', date_stop: '2026-07-02', spend: '-100.00' })),
  );

  expect(account.total).toHaveLength(1);
  expect(account.warnings.some((w) => w.includes('spend'))).toBe(true);
});

test('a row with no date_stop is not quietly taken for a single day', () => {
  const { date_stop: _dropped, ...unbounded } = row();
  const account = fromMetaInsights(payload(row({ date_start: '2026-07-02', date_stop: '2026-07-02' }), unbounded as MetaInsightsRow));

  expect(account.total).toHaveLength(1);
  expect(account.warnings.some((w) => w.includes('date_stop'))).toBe(true);
});

test('says that a total over several campaigns is not a funnel', () => {
  const account = fromMetaInsights(
    payload(row(), row({ campaign_id: '23852', campaign_name: 'Relógios — retargeting' })),
  );

  // Three ad sets under one campaign are one funnel in pieces. Two campaigns
  // are two funnels, and adding them describes nothing that exists.
  expect(account.warnings.some((w) => w.includes('not a funnel'))).toBe(true);
});

test('an empty actions array is a real zero, because a quiet day carries no action type', () => {
  const [day] = fromMetaInsights(payload(row({ actions: [], action_values: [] }))).total;

  expect(day!.addToCarts).toBe(0);
  expect(day!.purchases).toBe(0);
  expect(day!.revenue).toBe(0);
  // And the spend on that day is still real: the day happened, it just sold nothing.
  expect(day!.spend).toBe(256.62);
});

test('a present actions key that is not a list of actions is still a hole', () => {
  // An omitted key is Meta's zero; a key holding something that is not an
  // action list is a malformed response, and those are different.
  const account = fromMetaInsights(
    payload(row(), row({ date_start: '2026-07-02', date_stop: '2026-07-02', actions: 'lots' as never })),
  );

  expect(account.total).toHaveLength(1);
  expect(account.warnings.some((w) => w.includes('actions'))).toBe(true);
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

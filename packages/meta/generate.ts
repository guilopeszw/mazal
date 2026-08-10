// ─── packages/meta/generate.ts ───────────────────────────────────────────
// Writes the Meta payloads, then asserts they still carry the demo.
//
// Same contract as `packages/sim/write-fixtures.ts`: it writes the files and
// then checks that the files still do what the demo beat needs, exiting
// non-zero if they do not. A mock that drifts away from the audited numbers
// without anyone noticing is the one failure this whole package exists to
// prevent — `docs/demo-contract.md` publishes those numbers and a slide quotes
// them.
//
// Nothing here invents a number. Both payloads are re-encodings of fixtures the
// simulator already generated and guards:
//
//   demo-case2.json    → one campaign, split across three ad sets
//   demo-account.json  → one account, three products, one campaign each
//
// Run: pnpm meta:fixtures

import { readFileSync, writeFileSync } from 'node:fs';
import type { CampaignDay, LabelledCampaign, ProductCard } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import { diagnose, fitCurve, priorCurve, reallocate } from '@mazal/engine';
import { parseMetaCsv } from '@mazal/ingest';
import { fromMetaInsights } from './src/adapter.ts';
import { toAdsManagerCsv, totalAsEntity } from './src/csv.ts';
import { foldDaysByDate } from './src/fold.ts';
import { splitLargestRemainder, toCents } from './src/numbers.ts';
import type { MetaInsightsPayload, MetaInsightsRow } from './src/types.ts';

const here = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const sim = (name: string) => new URL(`../sim/fixtures/${name}`, import.meta.url);
const read = <T>(url: URL): T => JSON.parse(readFileSync(url, 'utf8')) as T;

const GENERATOR = 'packages/meta/generate.ts';
const NOTE = 'Synthetic. No Meta account was called to produce this file.';

/** Money out, as the Graph API writes it: a plain decimal string. */
const money = (brl: number): string => (Math.round(brl * 100) / 100).toFixed(2);

function insightsRow(
  day: CampaignDay,
  entity: { campaignId: string; campaignName: string; adsetId?: string; adsetName?: string },
): MetaInsightsRow {
  return {
    date_start: day.date,
    date_stop: day.date,
    campaign_id: entity.campaignId,
    campaign_name: entity.campaignName,
    ...(entity.adsetId ? { adset_id: entity.adsetId, adset_name: entity.adsetName } : {}),
    account_id: 'act_2026081',
    account_currency: 'BRL',
    spend: money(day.spend),
    impressions: String(day.impressions),
    reach: String(day.reach),
    inline_link_clicks: String(day.clicks),
    // Present even when everything is zero. An empty array is a day that sold
    // nothing; an absent key would mean we could not read it, and the adapter
    // refuses that.
    actions: [
      ...(day.addToCarts > 0 ? [{ action_type: 'add_to_cart', value: String(day.addToCarts) }] : []),
      ...(day.checkoutsInitiated > 0
        ? [{ action_type: 'initiate_checkout', value: String(day.checkoutsInitiated) }]
        : []),
      ...(day.purchases > 0 ? [{ action_type: 'purchase', value: String(day.purchases) }] : []),
      // A type this product does not read, in every payload on purpose: it is
      // in every real response, and the adapter has to ignore it rather than
      // fold it into a funnel count.
      { action_type: 'landing_page_view', value: String(Math.round(day.clicks * 0.82)) },
    ],
    action_values: day.revenue > 0 ? [{ action_type: 'purchase', value: money(day.revenue) }] : [],
  };
}

// ─── producer A — the diagnosis beat, split across ad sets ───────────────

const AD_SETS = ['Lookalike 1% — compradores', 'Interesse — relógios', 'Retargeting — 30 dias'];

/**
 * How one day's numbers divide between three ad sets.
 *
 * Deterministic, no RNG, period seven — an advertiser's week, and the same
 * shape the simulator gives a campaign. The amplitude is small enough that no
 * ad set ever falls near zero: an ad set with no impressions on a day is not a
 * split, it is an ad set that was off, and it would make the round trip test a
 * test about a different fixture.
 */
const adsetWeights = (dayIndex: number): number[] =>
  AD_SETS.map((_, j) => 0.5 - 0.14 * j + 0.1 * Math.sin((2 * Math.PI * (dayIndex + j * 2.5)) / 7));

const COUNT_FIELDS = [
  'impressions',
  'reach',
  'clicks',
  'addToCarts',
  'checkoutsInitiated',
  'purchases',
] as const;

function splitCase2(campaign: LabelledCampaign): MetaInsightsRow[] {
  const rows: MetaInsightsRow[] = [];
  const campaignId = campaign.days[0]?.campaignId ?? 'sim-881889';

  campaign.days.forEach((day, i) => {
    const weights = adsetWeights(i);

    const counts = Object.fromEntries(
      COUNT_FIELDS.map((field) => [field, splitLargestRemainder(day[field], weights)]),
    ) as Record<(typeof COUNT_FIELDS)[number], number[]>;
    const spend = splitLargestRemainder(toCents(day.spend), weights);

    /**
     * Revenue follows the purchases it came from, not the ad set weights.
     *
     * Splitting the two independently is arithmetically fine — each sums to its
     * own total — and produces rows that cannot exist: a leftover cent of
     * revenue landing on an ad set whose purchase share floored to zero. In the
     * first version that was 37 of the 90 rows in the committed CSV, each one a
     * stage-6 number sitting on a stage-5 zero, in a file the demo can upload.
     *
     * The campaign totals were right, which is exactly why the guard missed it:
     * it folds the ad sets back up and never looks at a row on its own.
     */
    const purchaseParts = counts.purchases;
    const revenueWeights = purchaseParts.some((p) => p > 0) ? purchaseParts : weights;
    const revenue = splitLargestRemainder(toCents(day.revenue), revenueWeights);

    AD_SETS.forEach((name, j) => {
      const part: CampaignDay = {
        date: day.date,
        campaignId,
        spend: spend[j]! / 100,
        impressions: counts.impressions[j]!,
        reach: counts.reach[j]!,
        clicks: counts.clicks[j]!,
        addToCarts: counts.addToCarts[j]!,
        checkoutsInitiated: counts.checkoutsInitiated[j]!,
        purchases: counts.purchases[j]!,
        revenue: revenue[j]! / 100,
      };
      rows.push(
        insightsRow(part, {
          campaignId,
          campaignName: 'Relógios — sempre ativo',
          adsetId: `23851${j + 1}0001`,
          adsetName: name,
        }),
      );
    });
  });

  return rows;
}

// ─── producer B — the allocator beat, one campaign per product ───────────

type AccountFixture = {
  seed: number;
  products: { id: string; card: ProductCard; days: CampaignDay[]; currentSpend: number }[];
};

const productName = (id: string): string =>
  id
    .replace(/-\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function accountRows(account: AccountFixture): MetaInsightsRow[] {
  return account.products.flatMap((product) =>
    product.days.map((day) =>
      insightsRow(day, {
        // The campaign id is the one already on the fixture's days, so the days
        // that come back out of the adapter are the fixture's days rather than
        // a relabelled copy of them. It is also the join a real integration
        // makes: the seller's product card meets the account at a campaign id.
        campaignId: day.campaignId,
        campaignName: productName(product.id),
      }),
    ),
  );
}

// ─── write ───────────────────────────────────────────────────────────────

const case2 = read<LabelledCampaign>(sim('demo-case2.json'));
const account = read<AccountFixture>(sim('demo-account.json'));

const case2Payload: MetaInsightsPayload = {
  data: splitCase2(case2),
  paging: { cursors: { before: 'MAZALQVFPZ', after: 'MAZALQVFPa' } },
  __mazal_fixture: {
    kind: 'fixture',
    generator: GENERATOR,
    derivedFrom: 'packages/sim/fixtures/demo-case2.json',
    note: NOTE,
  },
};

const accountPayload: MetaInsightsPayload = {
  data: accountRows(account),
  paging: { cursors: { before: 'MAZALQVFPb', after: 'MAZALQVFPc' } },
  __mazal_fixture: {
    kind: 'fixture',
    generator: GENERATOR,
    derivedFrom: 'packages/sim/fixtures/demo-account.json',
    note: NOTE,
  },
};

writeFileSync(here('demo-case2.meta-insights.json'), `${JSON.stringify(case2Payload, null, 2)}\n`);
writeFileSync(here('demo-account.meta-insights.json'), `${JSON.stringify(accountPayload, null, 2)}\n`);

const case2Account = fromMetaInsights(case2Payload);
const accountAccount = fromMetaInsights(accountPayload);

const CASE2_CAMPAIGN = 'Relógios — sempre ativo';

writeFileSync(
  here('demo-case2.adsets.csv'),
  toAdsManagerCsv(case2Account.entities, { perEntity: true, campaignName: CASE2_CAMPAIGN }),
);
writeFileSync(
  here('demo-case2.campaign.csv'),
  toAdsManagerCsv([totalAsEntity(CASE2_CAMPAIGN, case2Account.total)]),
);
writeFileSync(here('demo-account.campaigns.csv'), toAdsManagerCsv(accountAccount.entities));

// ─── the guard ───────────────────────────────────────────────────────────

const fail: string[] = [];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Key order differs between the fixture and a rebuilt day; value equality does not. */
const canonical = (days: CampaignDay[]) =>
  days.map((d) => [
    d.date,
    d.campaignId,
    d.spend,
    d.impressions,
    d.reach,
    d.clicks,
    d.addToCarts,
    d.checkoutsInitiated,
    d.purchases,
    d.revenue,
  ]);

// The payload, folded back up, has to be the fixture. Not close to it.
if (!same(canonical(case2Account.total), canonical(case2.days))) {
  fail.push('demo-case2: the payload does not fold back to the fixture days');
}

/**
 * And every row has to be a row Ads Manager could have exported.
 *
 * The fold above checks the totals, which is how 37 rows carrying revenue on
 * zero purchases sat in the committed CSV without failing anything. A guard
 * that only ever looks at the sum cannot see a per-entity row at all.
 */
for (const entity of case2Account.entities) {
  for (const day of entity.days) {
    if (day.purchases === 0 && day.revenue > 0) {
      fail.push(`demo-case2: ${entity.name} on ${day.date} reports revenue with no purchase behind it`);
    }
    if (day.checkoutsInitiated > day.addToCarts || day.purchases > day.checkoutsInitiated) {
      fail.push(`demo-case2: ${entity.name} on ${day.date} has a funnel stage wider than the one above it`);
    }
  }
}

// And so does the CSV, by the other door.
const fromAdsetsCsv = foldDaysByDate(parseMetaCsv(readFileSync(here('demo-case2.adsets.csv'), 'utf8')).days);
const fromCampaignCsv = parseMetaCsv(readFileSync(here('demo-case2.campaign.csv'), 'utf8')).days;
for (const [label, days] of [
  ['adsets.csv', fromAdsetsCsv],
  ['campaign.csv', fromCampaignCsv],
] as const) {
  const rebuilt = days.map((d) => ({ ...d, campaignId: case2.days[0]!.campaignId }));
  if (!same(canonical(rebuilt), canonical(case2.days))) {
    fail.push(`demo-case2: ${label} does not parse back to the fixture days`);
  }
}

// The diagnosis is the thing the demo actually shows, so it is checked directly
// against the numbers docs/demo-contract.md publishes.
const bench = diagnose({
  days: case2Account.total,
  card: case2.card,
  events: case2.events,
  reference: { kind: 'benchmark', table: benchmarks },
});
const self = diagnose({
  days: case2Account.total,
  card: case2.card,
  events: case2.events,
  reference: { kind: 'self', baselineDays: 14 },
});

if (bench.primary?.stage !== 4) fail.push(`demo-case2: primary stage is ${bench.primary?.stage}, not 4`);
if (bench.primary?.metric !== 'icRate') fail.push(`demo-case2: primary metric is ${bench.primary?.metric}`);
if (bench.primary?.deviation.toFixed(2) !== '-1.61') {
  fail.push(`demo-case2: benchmark deviation is ${bench.primary?.deviation.toFixed(2)}, not -1.61`);
}
if (self.primary?.deviation.toFixed(2) !== '-5.04') {
  fail.push(`demo-case2: self deviation is ${self.primary?.deviation.toFixed(2)}, not -5.04`);
}
if (bench.suspectedCause !== 'eta_shock') fail.push(`demo-case2: cause is ${bench.suspectedCause}`);
if (bench.changePoint?.date !== '2026-07-12') fail.push(`demo-case2: change point is ${bench.changePoint?.date}`);
if (bench.primary?.evidence?.type !== 'eta_change') fail.push('demo-case2: the store event no longer attaches');

// The account: every product's days survive the trip, and the advice still says
// the same thing. `currentSpend` is the last day's spend — that is what the
// seller is spending today, and it is what reallocate holds constant.
for (const product of account.products) {
  const entity = accountAccount.entities.find((e) => e.id === product.days[0]!.campaignId);
  if (!entity) {
    fail.push(`demo-account: ${product.id} is missing from the payload`);
    continue;
  }
  if (!same(canonical(entity.days), canonical(product.days))) {
    fail.push(`demo-account: ${product.id} does not survive the payload`);
  }
  if (entity.days.at(-1)!.spend !== product.currentSpend) {
    fail.push(`demo-account: ${product.id} current spend is not the last day's spend`);
  }
}

const funded = accountAccount.entities.map((entity) => {
  const product = account.products.find((p) => p.days[0]!.campaignId === entity.id)!;
  const m = benchmarks[product.card.category].metrics;
  const cpc = m.ctr.median > 0 ? m.cpm.median / 1000 / m.ctr.median : 0;
  const spent = entity.days.filter((d) => d.spend > 0);
  const typical = spent.reduce((sum, d) => sum + d.spend, 0) / Math.max(1, spent.length);
  return {
    id: entity.id,
    curve: fitCurve(entity.days, priorCurve({ cpc, cvr: m.cvr.median, typicalSpend: typical })),
    valuePerConversion: product.card.price * product.card.grossMargin,
    spend: entity.days.at(-1)!.spend,
  };
});

const advice = reallocate(funded, {});
for (const f of funded) {
  if (f.curve.source !== 'fitted') {
    fail.push(`demo-account: ${f.id} fits as '${f.curve.source}' through the payload, not 'fitted'`);
  }
}
if (advice.gain <= 0) fail.push(`demo-account: no money to find through the payload (gain ${advice.gain.toFixed(2)})`);
if (advice.moves.length < 2) fail.push('demo-account: a reallocation needs somewhere to come from and somewhere to go');
if (Math.abs(advice.moves.reduce((s, m) => s + m.delta, 0)) > 0.01) {
  fail.push('demo-account: the moves do not sum to zero — the budget is supposed to be held');
}

if (fail.length > 0) {
  console.error('\n  the Meta payloads do not carry the demo:\n');
  for (const f of fail) console.error(`    - ${f}`);
  console.error('');
  process.exit(1);
}

const brl = (n: number) => `R$${Math.round(n)}`;
console.log(`  demo-case2.meta-insights.json    ${case2Payload.data.length} rows, ${AD_SETS.length} ad sets`);
console.log(
  `    folds back to the fixture, and diagnoses stage ${bench.primary!.stage} ${bench.primary!.metric} ` +
    `at ${bench.primary!.deviation.toFixed(2)}σ, change point ${bench.changePoint!.date}. ok`,
);
console.log(`  demo-account.meta-insights.json  ${accountPayload.data.length} rows, ${accountAccount.entities.length} campaigns`);
console.log(`    ${brl(advice.budget)}/day held, ${brl(advice.gain)}/day found through the payload. ok`);

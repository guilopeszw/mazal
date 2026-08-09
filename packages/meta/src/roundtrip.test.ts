import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { CampaignDay, LabelledCampaign, ProductCard } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import { diagnose, fitCurve, priorCurve, reallocate } from '@mazal/engine';
import { parseMetaCsv } from '@mazal/ingest';
import { fromMetaInsights } from './adapter.ts';
import { foldDaysByDate } from './fold.ts';

/**
 * The gate that stops the mock drifting.
 *
 * `pnpm meta:fixtures` asserts all of this at the moment it writes the files,
 * which catches the person regenerating them. This catches everyone else: the
 * fixtures are committed, and a hand edit to a payload, a change to the adapter
 * or a new rule in `parseMetaCsv` would otherwise move the numbers on the demo
 * screen away from the ones `docs/demo-contract.md` publishes, quietly.
 */

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as T;
const readText = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const readSim = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../sim/fixtures/${name}`, import.meta.url), 'utf8')) as T;

const case2 = readSim<LabelledCampaign>('demo-case2.json');
const account = readSim<{
  products: { id: string; card: ProductCard; days: CampaignDay[]; currentSpend: number }[];
}>('demo-account.json');

const case2Payload = read<unknown>('demo-case2.meta-insights.json');
const accountPayload = read<unknown>('demo-account.meta-insights.json');

/** Same values, whatever order the keys were built in. */
const canonical = (days: CampaignDay[]) =>
  days.map((d) => [
    d.date, d.campaignId, d.spend, d.impressions, d.reach,
    d.clicks, d.addToCarts, d.checkoutsInitiated, d.purchases, d.revenue,
  ]);

test('the payload folds back to exactly the campaign the simulator wrote', () => {
  const { total, entities } = fromMetaInsights(case2Payload);

  expect(entities).toHaveLength(3);
  expect(entities.every((e) => e.level === 'adset')).toBe(true);
  expect(canonical(total)).toEqual(canonical(case2.days));
});

test('the CSV export parses back to the same days, by the other door', () => {
  // Ad-set level: ninety rows, three per day, folded by date. Campaign level:
  // thirty rows, already one per day. Both have to land on the fixture.
  const adsets = foldDaysByDate(parseMetaCsv(readText('demo-case2.adsets.csv')).days);
  const campaign = parseMetaCsv(readText('demo-case2.campaign.csv')).days;

  const relabel = (days: CampaignDay[]) =>
    days.map((d) => ({ ...d, campaignId: case2.days[0]!.campaignId }));

  expect(canonical(relabel(adsets))).toEqual(canonical(case2.days));
  expect(canonical(relabel(campaign))).toEqual(canonical(case2.days));
});

test('every ad set day sums to the campaign day, in cents', () => {
  const { total, entities } = fromMetaInsights(case2Payload);

  total.forEach((day, i) => {
    for (const field of ['impressions', 'reach', 'clicks', 'addToCarts', 'checkoutsInitiated', 'purchases'] as const) {
      expect(entities.reduce((sum, e) => sum + e.days[i]![field], 0)).toBe(day[field]);
    }
    for (const field of ['spend', 'revenue'] as const) {
      const cents = entities.reduce((sum, e) => sum + Math.round(e.days[i]![field] * 100), 0);
      expect(cents).toBe(Math.round(day[field] * 100));
    }
  });
});

test('the diagnosis through the payload is the one docs/demo-contract.md publishes', () => {
  const days = fromMetaInsights(case2Payload).total;
  const shared = { days, card: case2.card, events: case2.events };

  const bench = diagnose({ ...shared, reference: { kind: 'benchmark', table: benchmarks } });
  const self = diagnose({ ...shared, reference: { kind: 'self', baselineDays: 14 } });

  expect(bench.primary?.stage).toBe(4);
  expect(bench.primary?.metric).toBe('icRate');
  expect(bench.primary!.deviation.toFixed(2)).toBe('-1.61');
  expect(self.primary!.deviation.toFixed(2)).toBe('-5.04');
  expect(bench.suspectedCause).toBe('eta_shock');
  expect(bench.changePoint?.date).toBe('2026-07-12');
  // The sentence the demo is built around: the funnel broke on the day the
  // supplier's ETA moved.
  expect(bench.primary?.evidence?.type).toBe('eta_change');
});

test('the account arrives as three campaigns, each one its own product', () => {
  const { entities } = fromMetaInsights(accountPayload);

  expect(entities).toHaveLength(3);
  for (const product of account.products) {
    const entity = entities.find((e) => e.id === product.days[0]!.campaignId);
    expect(entity, `no campaign for ${product.id}`).toBeDefined();
    expect(canonical(entity!.days)).toEqual(canonical(product.days));
    // What the seller spends today, which is the budget the advice holds.
    expect(entity!.days.at(-1)!.spend).toBe(product.currentSpend);
  }
});

test('the allocator still finds the same money through the payload', () => {
  const { entities } = fromMetaInsights(accountPayload);

  const funded = entities.map((entity) => {
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

  // A curve the engine did not earn from the days must never be presented as
  // the seller's own — `source: 'prior'` is the category talking.
  for (const f of funded) expect(f.curve.source).toBe('fitted');

  const advice = reallocate(funded, {});
  expect(advice.gain).toBeGreaterThan(0);
  expect(advice.moves.length).toBeGreaterThanOrEqual(2);
  // The guarantee, checked rather than asserted in prose: the money moves and
  // the budget does not.
  expect(advice.moves.reduce((sum, m) => sum + m.delta, 0)).toBeCloseTo(0, 6);
  expect(advice.best.reduce((sum, b) => sum + b.spend, 0)).toBeCloseTo(advice.budget, 2);
});

test('both payloads say out loud that they are fixtures', () => {
  for (const payload of [case2Payload, accountPayload]) {
    const { fixture, warnings } = fromMetaInsights(payload);
    expect(fixture?.generator).toBe('packages/meta/generate.ts');
    expect(warnings.some((w) => w.includes('No Meta account was called'))).toBe(true);
  }
});

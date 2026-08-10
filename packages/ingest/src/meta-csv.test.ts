// ─── packages/ingest/src/meta-csv.test.ts ────────────────────────────────
// TDD mandatory. The test file IS the specification.
// Every quirk from docs/plan/C-ingest.md becomes a test case here.

import { describe, expect, test } from 'vitest';
import { parseMetaCsv } from './meta-csv.ts';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('parseMetaCsv', () => {
  // ─── clean file parsing ──────────────────────────────────────────────

  test('parses a clean single-row file into CampaignDay with correct field mapping', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Reach,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,500,10000,8500,200,20,15,5,1500',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days).toHaveLength(1);
    const day = days[0]!;
    expect(day.date).toBe('2026-07-01');
    expect(day.campaignId).toBe('Verao 2026');
    expect(day.spend).toBe(500);
    expect(day.impressions).toBe(10000);
    expect(day.reach).toBe(8500);
    expect(day.clicks).toBe(200);
    expect(day.addToCarts).toBe(20);
    expect(day.checkoutsInitiated).toBe(15);
    expect(day.purchases).toBe(5);
    expect(day.revenue).toBe(1500);
    expect(warnings).toHaveLength(0);
  });

  // ─── header priority collision ────────────────────────────────────────

  test('Cost per link click column does not overwrite Link clicks count', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Link clicks,Cost per link click (BRL),Purchases',
      '2026-07-01,Verao 2026,100,200,"0,50",5',
    ].join('\n');

    const { days } = parseMetaCsv(csv);
    const day = days[0]!;

    expect(day.clicks).toBe(200);
    expect(day.spend).toBe(100);
  });

  // ─── missing column preset warnings ───────────────────────────────

  test('emits top-level warnings when columns are completely missing from seller preset', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,500,10000,200,5,1500',
    ].join('\n');

    const { warnings } = parseMetaCsv(csv);

    expect(warnings.some(w => w.includes('Column "addToCarts" missing from CSV export'))).toBe(true);
    expect(warnings.some(w => w.includes('Column "checkoutsInitiated" missing from CSV export'))).toBe(true);
  });

  // ─── missing & unparseable values ─────────────────────────────────────

  test('reads an em-dash as a missing value, not as zero', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,"1.240,50",84210,1802,—,10,12,"3.480,00"',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);
    const day = days[0]!;

    expect(day.spend).toBe(1240.5);
    expect(day.addToCarts).toBe(0);
    expect(warnings).toContain('addToCarts missing on 2026-07-01');
  });

  test('reads double-dash as a missing value with warning including resolved date', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-04,Verao 2026,750,52000,1100,20,--,8,2320',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);
    const day = days[0]!;

    expect(day.checkoutsInitiated).toBe(0);
    expect(warnings).toContain('checkoutsInitiated missing on 2026-07-04');
  });

  test('emits warning for unparseable value "N/A"', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-07,Verao 2026,400,5000,500,N/A,10,3,750',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);
    const day = days[0]!;

    expect(day.addToCarts).toBe(0);
    expect(warnings.some(w => w.includes('Unparseable addToCarts value "N/A" on 2026-07-07'))).toBe(true);
  });

  // ─── pt-BR number format & thousand separators ─────────────────────────

  test('parses pt-BR number format "1.240,50" as 1240.5', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-01,Test,"1.240,50",84210,1802,20,10,12,"3.480,00"',
    ].join('\n');

    const { days } = parseMetaCsv(csv);
    const day = days[0]!;

    expect(day.spend).toBe(1240.5);
    expect(day.revenue).toBe(3480.0);
  });

  test('parses pt-BR thousand separators "10.240" and "1.024" correctly', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-06,Verao 2026,500,"10.240","1.024",50,30,5,1250',
    ].join('\n');

    const { days } = parseMetaCsv(csv);
    const day = days[0]!;

    expect(day.impressions).toBe(10240);
    expect(day.clicks).toBe(1024);
  });

  // ─── header validation ────────────────────────────────────────────────

  test('fails loudly when CSV headers do not match recognised date or count columns', () => {
    const csv = [
      'Foo,Bar',
      '1,2',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days).toHaveLength(0);
    expect(warnings.some(w => w.includes('No recognised Meta Ads headers found'))).toBe(true);
  });

  // ─── currency extraction ──────────────────────────────────────────────

  test('extracts currency from header parenthetical', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-01,Test,500,10000,200,20,10,5,1500',
    ].join('\n');

    const result = parseMetaCsv(csv);

    expect(result.currency).toBe('BRL');
  });

  // ─── aggregated rows ─────────────────────────────────────────────────

  test('drops aggregated rows (start ≠ end) from daily array with warning', () => {
    const csv = [
      'Reporting starts,Reporting ends,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-01,2026-07-05,Verao 2026,4691,341810,7312,400,300,50,14500',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days).toHaveLength(0);
    expect(warnings.some(w => w.includes('Dropped aggregated row'))).toBe(true);
  });

  // ─── totals row detection ─────────────────────────────────────────────

  test('drops totals row when Total is in column 0 Reporting starts', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,500,10000,200,20,10,5,1500',
      'Total,,4691,341810,7312,400,300,50,14500',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days).toHaveLength(1);
    const day = days[0]!;
    expect(day.campaignId).toBe('Verao 2026');
    expect(warnings.some(w => w.includes('totals row'))).toBe(true);
  });

  // ─── fixture integration test ─────────────────────────────────────────

  test('parses the hand-built meta-export.csv fixture end-to-end', () => {
    const csv = readFileSync(resolve(__dirname, '../test/meta-export.csv'), 'utf-8');
    const { days, warnings, currency } = parseMetaCsv(csv);

    // 7 daily rows (aggregated row dropped), totals row dropped
    expect(days).toHaveLength(7);
    expect(currency).toBe('BRL');

    // First row: pt-BR spend "1.240,50" → 1240.5
    const day0 = days[0]!;
    expect(day0.date).toBe('2026-07-01');
    expect(day0.campaignId).toBe('Verao 2026');
    expect(day0.spend).toBe(1240.5);
    expect(day0.impressions).toBe(84210);

    // Row 6 (2026-07-06): pt-BR thousands separator "10.240" -> 10240, "1.024" -> 1024
    const day5 = days[5]!;
    expect(day5.date).toBe('2026-07-06');
    expect(day5.impressions).toBe(10240);
    expect(day5.clicks).toBe(1024);

    // Row 7 (2026-07-07): "N/A" in addToCarts field
    const day6 = days[6]!;
    expect(day6.date).toBe('2026-07-07');
    expect(day6.addToCarts).toBe(0);

    // Warnings check
    expect(warnings.some(w => w.includes('Dropped aggregated row'))).toBe(true);
    expect(warnings.some(w => w.includes('totals row'))).toBe(true);
  });
});

test('a conversion-value column never lands in its count twin', () => {
  // Header matching is by substring, so "Adds to cart conversion value" used to
  // match 'adds to cart' and write reais into the cart count — about a 40x
  // inflation of stage 3's numerator, with no warning, which reads as a healthy
  // product page and moves the blame one stage down the funnel.
  const csv = [
    'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Reach,Link clicks,Adds to cart,Adds to cart conversion value,Checkouts initiated,Purchases,Purchases conversion value',
    '2026-07-01,Congelados,45.00,6000,4200,90,12,478.80,9,6,239.40',
  ].join('\n');

  const { days } = parseMetaCsv(csv);

  expect(days[0]!.addToCarts).toBe(12);
  expect(days[0]!.checkoutsInitiated).toBe(9);
  expect(days[0]!.purchases).toBe(6);
  expect(days[0]!.revenue).toBe(239.4);
});

test('a spelled-out rate column never lands in the click count', () => {
  // "CTR (link click-through rate)" strips to `ctr` and is skipped. Spelled out
  // without the parenthetical there is no `ctr` substring, so it matched
  // 'link click' — and the percent sign is stripped, so 1.53% became 1.53 clicks.
  const csv = [
    'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Reach,Link clicks,Link click-through rate',
    '2026-07-01,Congelados,45.00,6000,4200,90,1.53%',
  ].join('\n');

  const { days } = parseMetaCsv(csv);
  expect(days[0]!.clicks).toBe(90);
});

test('two columns mapping to one field keep the first and say so', () => {
  // Exports routinely carry both a total and its unique twin. The write used to
  // be unconditional, so column order decided the funnel's size — silently, and
  // unique counts are always the smaller ones.
  const csv = [
    'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Reach,Link clicks,Unique link clicks',
    '2026-07-01,Congelados,45.00,6000,4200,500,320',
  ].join('\n');

  const { days, warnings } = parseMetaCsv(csv);
  expect(days[0]!.clicks).toBe(500);
  expect(warnings.some((w) => w.includes('both map to clicks'))).toBe(true);
});

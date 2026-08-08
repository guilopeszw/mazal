// ─── packages/ingest/src/meta-csv.test.ts ────────────────────────────────
// TDD mandatory. The test file IS the specification.
// Every quirk from docs/plan/C-ingest.md becomes a test case here.

import { describe, expect, test } from 'vitest';
import { parseMetaCsv } from './meta-csv.js';
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
    expect(days[0].date).toBe('2026-07-01');
    expect(days[0].campaignId).toBe('Verao 2026');
    expect(days[0].spend).toBe(500);
    expect(days[0].impressions).toBe(10000);
    expect(days[0].reach).toBe(8500);
    expect(days[0].clicks).toBe(200);
    expect(days[0].addToCarts).toBe(20);
    expect(days[0].checkoutsInitiated).toBe(15);
    expect(days[0].purchases).toBe(5);
    expect(days[0].revenue).toBe(1500);
    expect(warnings).toHaveLength(0);
  });

  // ─── missing values ──────────────────────────────────────────────────

  test('reads an em-dash as a missing value, not as zero', () => {
    // This is the exact test from docs/testing.md
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Adds to cart,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,"1.240,50",84210,1802,—,12,"3.480,00"',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days[0].spend).toBe(1240.5);
    expect(days[0].addToCarts).toBe(0);
    expect(warnings).toContain('addToCarts missing on 2026-07-01');
  });

  test('reads double-dash as a missing value with warning', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-04,Verao 2026,750,52000,1100,--,8,2320',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days[0].checkoutsInitiated).toBe(0);
    expect(warnings).toContain('checkoutsInitiated missing on 2026-07-04');
  });

  test('reads empty field as a missing value with warning', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Checkouts initiated,Purchases,Purchases conversion value',
      '2026-07-05,Verao 2026,620,43800,920,,6,1740',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days[0].checkoutsInitiated).toBe(0);
    expect(warnings).toContain('checkoutsInitiated missing on 2026-07-05');
  });

  // ─── pt-BR number format ─────────────────────────────────────────────

  test('parses pt-BR number format "1.240,50" as 1240.5', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Test,"1.240,50",84210,1802,12,"3.480,00"',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    expect(days[0].spend).toBe(1240.5);
    expect(days[0].revenue).toBe(3480.0);
  });

  test('parses standard number format without confusion', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Test,1240.50,84210,1802,12,3480.00',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    expect(days[0].spend).toBe(1240.5);
    expect(days[0].revenue).toBe(3480.0);
  });

  // ─── currency extraction ──────────────────────────────────────────────

  test('extracts currency from header parenthetical', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Test,500,10000,200,5,1500',
    ].join('\n');

    const result = parseMetaCsv(csv);

    expect(result.currency).toBe('BRL');
  });

  test('extracts USD currency from header', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (USD),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Test,500,10000,200,5,1500',
    ].join('\n');

    const result = parseMetaCsv(csv);

    expect(result.currency).toBe('USD');
  });

  // ─── date formats ────────────────────────────────────────────────────

  test('handles DD/MM/YYYY date format', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '15/07/2026,Test,500,10000,200,5,1500',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    expect(days[0].date).toBe('2026-07-15');
  });

  test('handles ISO YYYY-MM-DD date format', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-15,Test,500,10000,200,5,1500',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    expect(days[0].date).toBe('2026-07-15');
  });

  // ─── aggregated rows ─────────────────────────────────────────────────

  test('detects aggregated rows (start ≠ end) and warns', () => {
    const csv = [
      'Reporting starts,Reporting ends,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,2026-07-05,Verao 2026,4691,341810,7312,50,14500',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days).toHaveLength(1);
    expect(warnings.some(w => w.includes('aggregated'))).toBe(true);
  });

  // ─── non-campaign rows ───────────────────────────────────────────────

  test('drops totals rows with warning', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,500,10000,200,5,1500',
      'Total,,4691,341810,7312,50,14500',
    ].join('\n');

    const { days, warnings } = parseMetaCsv(csv);

    expect(days).toHaveLength(1);
    expect(days[0].campaignId).toBe('Verao 2026');
    expect(warnings.some(w => w.includes('totals row'))).toBe(true);
  });

  test('drops empty trailing lines', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Verao 2026,500,10000,200,5,1500',
      '',
      '',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    expect(days).toHaveLength(1);
  });

  // ─── rate columns are ignored ─────────────────────────────────────────

  test('ignores rate columns — CTR, CPC, CPM, ROAS do not appear in output', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,CTR (link click-through rate),CPC (cost per link click),"CPM (cost per 1,000 impressions)",Purchases,Purchases conversion value,Website purchase ROAS (return on ad spend)',
      '2026-07-01,Test,500,10000,200,2.00%,2.50,50.00,5,1500,3.00',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    // Output is CampaignDay — no rate fields exist
    expect(days[0].spend).toBe(500);
    expect(days[0].clicks).toBe(200);
    expect(days[0].purchases).toBe(5);
    // Rates are derived via metrics.ts, not stored
    expect('ctr' in days[0]).toBe(false);
    expect('cpc' in days[0]).toBe(false);
  });

  // ─── fixture integration test ─────────────────────────────────────────

  test('parses the hand-built meta-export.csv fixture end-to-end', () => {
    const csv = readFileSync(resolve(__dirname, '../test/meta-export.csv'), 'utf-8');
    const { days, warnings, currency } = parseMetaCsv(csv);

    // 5 daily rows + 1 aggregated row (kept with warning), totals row dropped
    expect(days).toHaveLength(6);
    expect(currency).toBe('BRL');

    // First row: pt-BR spend "1.240,50" → 1240.5
    expect(days[0].date).toBe('2026-07-01');
    expect(days[0].campaignId).toBe('Verao 2026');
    expect(days[0].spend).toBe(1240.5);
    expect(days[0].impressions).toBe(84210);
    expect(days[0].clicks).toBe(1802);
    expect(days[0].addToCarts).toBe(142);
    expect(days[0].checkoutsInitiated).toBe(98);
    expect(days[0].purchases).toBe(12);
    expect(days[0].revenue).toBe(3480.0);

    // Second row: em-dash missing addToCarts
    expect(days[1].addToCarts).toBe(0);

    // Fourth row: double-dash missing checkoutsInitiated
    expect(days[3].checkoutsInitiated).toBe(0);

    // Fifth row: checkoutsInitiated is present (48), the empty field is the skipped 'Cost per add to cart' rate column
    expect(days[4].checkoutsInitiated).toBe(48);

    // Warnings for missing values, aggregated row, totals row
    expect(warnings.some(w => w.includes('addToCarts missing'))).toBe(true);
    expect(warnings.some(w => w.includes('checkoutsInitiated missing'))).toBe(true);
    expect(warnings.some(w => w.includes('aggregated'))).toBe(true);
    expect(warnings.some(w => w.includes('totals row'))).toBe(true);
  });

  // ─── multiple campaigns ───────────────────────────────────────────────

  test('parses rows from multiple campaigns', () => {
    const csv = [
      'Reporting starts,Campaign name,Amount spent (BRL),Impressions,Link clicks,Purchases,Purchases conversion value',
      '2026-07-01,Campaign A,500,10000,200,5,1500',
      '2026-07-01,Campaign B,300,8000,150,3,900',
    ].join('\n');

    const { days } = parseMetaCsv(csv);

    expect(days).toHaveLength(2);
    expect(days[0].campaignId).toBe('Campaign A');
    expect(days[1].campaignId).toBe('Campaign B');
  });
});

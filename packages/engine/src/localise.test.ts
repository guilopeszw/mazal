import { expect, test } from 'vitest';
import { diagnose } from './index.ts';
import { apparelCard, benchmarkRef, healthyDays } from '../test/fixtures.ts';

test('names stage 3 when ATC is far below the category median and everything upstream is fine', () => {
  const days = healthyDays().map((d) => ({ ...d, addToCarts: Math.round(d.clicks * 0.011) }));

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(3);
  expect(result.primary?.metric).toBe('atcRate');
  expect(result.suspectedCause).toBe('thin_pdp');
});

test('does not flag a healthy campaign at all', () => {
  const result = diagnose({ days: healthyDays(), card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary).toBeNull();
  expect(result.secondary).toEqual([]);
  expect(result.suspectedCause).toBe('none');
});

test('refuses to flag a stage below its minimum sample, however bad the rate looks', () => {
  // 60 clicks and zero add-to-carts. Stage 3 needs 100 clicks before it may
  // speak, and an agent that cries wolf on 60 gets uninstalled. Spend is scaled
  // with impressions so the media stages stay healthy and cannot confound this.
  const days = healthyDays().slice(0, 1).map((d) => ({
    ...d, spend: 100, impressions: 5000, reach: 4200, clicks: 60,
    addToCarts: 0, checkoutsInitiated: 0, purchases: 0,
  }));

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary).toBeNull();
  expect(result.suspectedCause).toBe('none');
});

test('names stage 4 when checkouts collapse and add-to-carts are fine', () => {
  const days = healthyDays().map((d) => ({ ...d, checkoutsInitiated: 1, purchases: 0 }));

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(4);
  expect(result.primary?.metric).toBe('icRate');
});

test('reports the earliest broken stage as primary and the rest as symptoms', () => {
  // ATC and IC both collapse. Stage 3 comes first, so stage 4 is a symptom of it.
  const days = healthyDays().map((d) => ({ ...d, addToCarts: 2, checkoutsInitiated: 0, purchases: 0 }));

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(3);
  expect(result.secondary.every((f) => f.severity === 'secondary')).toBe(true);
  expect(result.secondary.every((f) => f.stage > 3)).toBe(true);
});

test('a stockout event on a stage 3 break names the stockout, not a thin page', () => {
  const days = healthyDays().map((d) => ({ ...d, addToCarts: 2, checkoutsInitiated: 0, purchases: 0 }));
  const events = [{ date: '2026-07-14', type: 'stockout' as const, detail: 'stock on hand 200 -> 0' }];

  const result = diagnose({ days, card: apparelCard, events, reference: benchmarkRef });

  expect(result.suspectedCause).toBe('stockout');
});

test('an ETA change on a stage 4 break names the ETA shock', () => {
  const days = healthyDays().map((d) => ({ ...d, checkoutsInitiated: 1, purchases: 0 }));
  const events = [{ date: '2026-07-14', type: 'eta_change' as const, detail: 'supplier ETA 12d -> 28d' }];

  const result = diagnose({ days, card: apparelCard, events, reference: benchmarkRef });

  expect(result.suspectedCause).toBe('eta_shock');
});

test('diagnoses the campaign as it is now, not as its thirty-day average', () => {
  // Healthy for twenty days, then ATC collapses for ten. The full-window mean
  // is comfortably inside the benchmark; the campaign is still broken.
  const days = healthyDays().map((d, i) =>
    i < 20 ? d : { ...d, addToCarts: 1, checkoutsInitiated: 0, purchases: 0 });

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(3);
});

test('calls it a tracking break when the whole conversion funnel dies but the media keeps running', () => {
  // Impressions and clicks are untouched; everything the pixel reports is gone.
  // A seller told to refresh their creative here spends another week for nothing.
  const days = healthyDays().map((d) => ({
    ...d, addToCarts: 1, checkoutsInitiated: 0, purchases: 0, revenue: 0,
  }));

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.suspectedCause).toBe('pixel_break');
});

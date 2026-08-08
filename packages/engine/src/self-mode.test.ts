import { expect, test } from 'vitest';
import { diagnose } from './index.ts';
import { apparelCard, benchmarkRef, healthyDays } from '../test/fixtures.ts';

const selfRef = { kind: 'self' as const, baselineDays: 14 };

test('self mode flags a campaign that fell away from its own baseline', () => {
  // Every rate here is fine against the category. It is only broken relative to
  // what this campaign was doing a fortnight ago, which is the whole point of
  // the in-flight arm.
  const days = healthyDays().map((d, i) =>
    i < 20 ? { ...d, addToCarts: 40 } : { ...d, addToCarts: 12, checkoutsInitiated: 3, purchases: 1 });

  const result = diagnose({ days, card: apparelCard, events: [], reference: selfRef });

  expect(result.primary?.stage).toBe(3);
  expect(result.primary?.metric).toBe('atcRate');
});

test('self mode does not invent a problem in a flat campaign', () => {
  const result = diagnose({ days: healthyDays(), card: apparelCard, events: [], reference: selfRef });

  expect(result.primary).toBeNull();
  expect(result.suspectedCause).toBe('none');
});

test('names the date the metric turned', () => {
  const days = healthyDays().map((d, i) =>
    i < 20 ? d : { ...d, addToCarts: 1, checkoutsInitiated: 0, purchases: 0 });

  const result = diagnose({ days, card: apparelCard, events: [], reference: benchmarkRef });

  expect(result.changePoint?.metric).toBe('atcRate');
  // Day 21 is the first broken day; the 3-day window crosses within a day of it.
  expect(result.changePoint?.date).toMatch(/^2026-07-2[123]$/);
});

test('attaches the event that explains the break, within a day of the change point', () => {
  const days = healthyDays().map((d, i) =>
    i < 20 ? d : { ...d, addToCarts: 1, checkoutsInitiated: 0, purchases: 0 });
  const events = [
    { date: '2026-07-05', type: 'creative_refresh' as const, detail: 'unrelated, weeks earlier' },
    { date: '2026-07-21', type: 'stockout' as const, detail: 'stock on hand 200 -> 0' },
  ];

  const result = diagnose({ days, card: apparelCard, events, reference: benchmarkRef });

  expect(result.primary?.evidence?.type).toBe('stockout');
  expect(result.primary?.evidence?.detail).toBe('stock on hand 200 -> 0');
});

test('does not attach an event that has nothing to do with the broken stage', () => {
  const days = healthyDays().map((d, i) =>
    i < 20 ? d : { ...d, addToCarts: 1, checkoutsInitiated: 0, purchases: 0 });
  const events = [{ date: '2026-07-21', type: 'creative_refresh' as const, detail: 'new hero image' }];

  const result = diagnose({ days, card: apparelCard, events, reference: benchmarkRef });

  expect(result.primary?.evidence).toBeUndefined();
});

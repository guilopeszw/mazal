import { expect, test } from 'vitest';
import { predict } from './index.ts';
import { apparelCard, healthyDays } from '../test/fixtures.ts';
import { benchmarks } from '@mazal/data';

const width = (v: { p10: number; p90: number }) => v.p90 - v.p10;

test('history narrows the band — the claim that answers "you cannot predict that"', () => {
  const blind = predict({ card: apparelCard, table: benchmarks });
  const informed = predict({ card: apparelCard, table: benchmarks, history: healthyDays() });

  expect(width(informed.predictedRoas)).toBeLessThan(width(blind.predictedRoas));
});

test('more history narrows it further', () => {
  const week = predict({ card: apparelCard, table: benchmarks, history: healthyDays().slice(0, 7) });
  const month = predict({ card: apparelCard, table: benchmarks, history: healthyDays() });

  expect(width(month.predictedRoas)).toBeLessThan(width(week.predictedRoas));
});

test('a single day of history is not treated as evidence', () => {
  // One day cannot narrow anything honestly. The band must not move.
  const blind = predict({ card: apparelCard, table: benchmarks });
  const oneDay = predict({ card: apparelCard, table: benchmarks, history: healthyDays().slice(0, 1) });

  expect(oneDay.predictedRoas).toEqual(blind.predictedRoas);
});

test('the band still centres somewhere sane once history is used', () => {
  const informed = predict({ card: apparelCard, table: benchmarks, history: healthyDays() });

  expect(informed.predictedRoas.p10).toBeLessThanOrEqual(informed.predictedRoas.p50);
  expect(informed.predictedRoas.p50).toBeLessThanOrEqual(informed.predictedRoas.p90);
  expect(informed.predictedRoas.p10).toBeGreaterThan(0);
});

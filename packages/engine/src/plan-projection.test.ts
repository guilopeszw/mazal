import { expect, test } from 'vitest';
import { buildPlan, diagnose, predict } from './index.ts';
import { apparelCard, benchmarkRef, healthyDays } from '../test/fixtures.ts';
import { benchmarks } from '@mazal/data';

const broken = () => diagnose({
  days: healthyDays().map((d) => ({ ...d, addToCarts: 2, checkoutsInitiated: 0, purchases: 0 })),
  card: apparelCard, events: [], reference: benchmarkRef,
});

test('the projection is a real band, not three zeros', () => {
  const plan = buildPlan(broken(), apparelCard);

  expect(plan.projected.p50).toBeGreaterThan(0);
  expect(plan.projected.p10).toBeLessThanOrEqual(plan.projected.p50);
  expect(plan.projected.p50).toBeLessThanOrEqual(plan.projected.p90);
});

test('fixing the broken stage projects better than the campaign is doing now', () => {
  const d = broken();
  const plan = buildPlan(d, apparelCard);
  const today = predict({ card: apparelCard, table: benchmarks });

  // The finding says atcRate is far below reference; restoring it must move the
  // projection up from where the category alone would put it.
  expect(plan.projected.p50).toBeGreaterThan(today.predictedRoas.p50);
});

test('a healthy campaign projects nothing, because there is nothing to fix', () => {
  const healthy = diagnose({ days: healthyDays(), card: apparelCard, events: [], reference: benchmarkRef });
  const plan = buildPlan(healthy, apparelCard);

  expect(plan.actions).toEqual([]);
  expect(plan.projected).toEqual({ p10: 0, p50: 0, p90: 0 });
});

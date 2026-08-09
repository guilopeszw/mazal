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

test('a cost metric projects an improvement too — it gets better by falling', () => {
  // CPM well above the category median. Both branches of the ratio once read
  // reference/observed, so a cost fault projected a gain below 1, was clamped to
  // 1, and showed the seller nothing to gain from fixing it.
  const expensive = diagnose({
    days: healthyDays().map((d) => ({ ...d, spend: d.spend * 3 })),
    card: apparelCard, events: [], reference: benchmarkRef,
  });
  const plan = buildPlan(expensive, apparelCard);
  const today = predict({ card: apparelCard, table: benchmarks });

  expect(expensive.primary?.metric).toBe('cpm');
  expect(plan.projected.p50).toBeGreaterThan(today.predictedRoas.p50);
});

import { expect, test } from 'vitest';
import { buildPlan, diagnose } from './index.ts';
import { apparelCard, benchmarkRef, healthyDays } from '../test/fixtures.ts';

const brokenPdp = () => diagnose({
  days: healthyDays().map((d) => ({ ...d, addToCarts: 2, checkoutsInitiated: 0, purchases: 0 })),
  card: apparelCard, events: [], reference: benchmarkRef,
});

test('a product-layer break gets zero media actions', () => {
  // Telling a seller whose product page is broken to refresh their creative is
  // the exact failure the whole product exists to prevent.
  const plan = buildPlan(brokenPdp(), apparelCard);

  expect(plan.actions.length).toBeGreaterThan(0);
  expect(plan.actions.some((a) => /creative|audience|bid|budget/i.test(a.change))).toBe(false);
});

test('every action says who can perform it', () => {
  const plan = buildPlan(brokenPdp(), apparelCard);

  for (const a of plan.actions) expect(['mazal', 'seller']).toContain(a.actor);
});

test('an action moves a named metric from what was observed to the reference', () => {
  const d = brokenPdp();
  const plan = buildPlan(d, apparelCard);

  expect(plan.actions[0]!.expectedEffect.metric).toBe(d.primary!.metric);
  expect(plan.actions[0]!.expectedEffect.from).toBeCloseTo(d.primary!.observed, 6);
  expect(plan.actions[0]!.expectedEffect.to).toBeCloseTo(d.primary!.reference, 6);
});

test('a healthy campaign gets no actions at all', () => {
  const healthy = diagnose({ days: healthyDays(), card: apparelCard, events: [], reference: benchmarkRef });

  expect(buildPlan(healthy, apparelCard).actions).toEqual([]);
});

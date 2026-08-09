import { expect, test } from 'vitest';
import { predict } from './index.ts';
import { apparelCard, benchmarkRef } from '../test/fixtures.ts';
import { benchmarks } from '@mazal/data';

const table = benchmarks;

test('break-even ROAS is one over the gross margin, and the band is reported around it', () => {
  const v = predict({ card: apparelCard, table });

  expect(v.breakEvenRoas).toBeCloseTo(1 / apparelCard.grossMargin, 6);
  expect(v.predictedRoas.p10).toBeLessThanOrEqual(v.predictedRoas.p50);
  expect(v.predictedRoas.p50).toBeLessThanOrEqual(v.predictedRoas.p90);
});

test('a product that cannot clear break-even at its best case is not launched', () => {
  // A 5% margin needs 20x ROAS. Nothing in the benchmark distribution reaches it.
  const v = predict({ card: { ...apparelCard, grossMargin: 0.05 }, table });

  expect(v.decision).toBe('dont_launch');
  expect(v.killTrigger).toBeUndefined();
});

test('a verdict that straddles break-even must name the trigger to kill it', () => {
  // Swept rather than hand-picked: whichever margin lands in the straddle band,
  // the rule that killTrigger is set there has to hold.
  const straddling = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    .map((grossMargin) => predict({ card: { ...apparelCard, grossMargin }, table }))
    .filter((v) => v.decision === 'launch_small');

  expect(straddling.length).toBeGreaterThan(0);
  for (const v of straddling) {
    expect(v.killTrigger, JSON.stringify(v)).toBeTruthy();
    expect(v.predictedRoas.p10).toBeLessThan(v.breakEvenRoas);
    expect(v.breakEvenRoas).toBeLessThan(v.predictedRoas.p90);
  }
});

test('the same card predicts the same band twice — a seller re-running this sees one answer', () => {
  const a = predict({ card: apparelCard, table });
  const b = predict({ card: apparelCard, table });

  expect(a.predictedRoas).toEqual(b.predictedRoas);
});

void benchmarkRef;

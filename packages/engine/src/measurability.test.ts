import { expect, test } from 'vitest';
import { measurability } from './index.ts';
import { apparelCard } from '../test/fixtures.ts';
import { benchmarks } from '@mazal/data';

const card = { ...apparelCard, category: 'health_beauty' as const };

test('a small budget cannot reach the stage that judges checkout', () => {
  // At R$50/day this campaign gets ~14 add-to-carts a week against a minimum of
  // 30, so stage 4 can never speak inside the seven-day window diagnose uses.
  const m = measurability(card, 50, benchmarks);

  expect(m.silent).toContain(4);
});

test('a larger budget reaches every stage', () => {
  const m = measurability(card, 400, benchmarks);

  expect(m.silent).toEqual([]);
});

test('says how many days each stage needs, not just whether', () => {
  const m = measurability(card, 50, benchmarks);
  const stage4 = m.stages.find((s) => s.stage === 4);

  expect(stage4!.daysToSpeak).toBeGreaterThan(7);
  expect(stage4!.metric).toBe('icRate');
});

test('more budget is never worse', () => {
  const small = measurability(card, 100, benchmarks);
  const large = measurability(card, 1000, benchmarks);

  expect(large.silent.length).toBeLessThanOrEqual(small.silent.length);
});

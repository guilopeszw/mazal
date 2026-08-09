import { expect, test } from 'vitest';
import { diagnose } from './index.ts';
import { apparelCard, benchmarkRef, healthyDays } from '../test/fixtures.ts';

// Stage 3 breaks with no stockout, no price problem, no explaining event.
const brokenAtc = () => healthyDays().map((d) => ({
  ...d, addToCarts: 2, checkoutsInitiated: 0, purchases: 0,
}));

test('a page below the category on photos is called thin', () => {
  const card = { ...apparelCard, pdpImages: 1, pdpDescriptionLength: 120 };

  const result = diagnose({ days: brokenAtc(), card, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(3);
  expect(result.suspectedCause).toBe('thin_pdp');
});

test('a page with more photos than the category median is not called thin', () => {
  // 8 photos against a category p75 of 4, 900 characters against a median of 409.
  // Calling this thin is the engine inventing a cause it has no evidence for,
  // and the seller rewrites a page that was never the problem.
  const card = { ...apparelCard, pdpImages: 8, pdpDescriptionLength: 900 };

  const result = diagnose({ days: brokenAtc(), card, events: [], reference: benchmarkRef });

  expect(result.primary?.stage).toBe(3);
  expect(result.suspectedCause).not.toBe('thin_pdp');
});

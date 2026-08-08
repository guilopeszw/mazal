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

import { expect, test } from 'vitest';
import { benchmarks } from './index.ts';
import type { OlistCategory } from '@mazal/contracts';
import raw from './benchmarks.json' with { type: 'json' };

/**
 * Asserts the committed output, not the code that wrote it — `derive.test.ts` covers
 * the parser and the quantiles, and nothing until now covered the 62 × 12 table they
 * produce. A metric that silently stops being derived surfaces here rather than in the
 * engine. It is not redundant with the `BenchmarkTable` cast in `index.ts` — that cast
 * exists precisely because a JSON import widens every string literal and cannot be
 * checked. This is where the checking happens.
 */
const METRICS = [
  'cpm', 'ctr', 'atcRate', 'icRate', 'cvr', 'aov',
  'price', 'freightRatio', 'deliveryDays',
  'reviewAvg', 'photos', 'descriptionLength',
] as const;

/** Priors, not measurements: `source: 'prior'` and `n: 0`, so the UI prints them as estimates. */
const PRIORS = ['cpm', 'ctr', 'cvr', 'atcRate', 'icRate'];

const entries = Object.entries(benchmarks);

test('every category in the union has a row, and every row has all twelve metrics', () => {
  expect(entries).toHaveLength(62);

  for (const [key, row] of entries) {
    expect(row.category).toBe(key);
    expect(Object.keys(row.metrics).sort()).toEqual([...METRICS].sort());
  }
});

test('every distribution is ordered, finite, and says where it came from', () => {
  for (const [key, row] of entries) {
    for (const metric of METRICS) {
      const d = row.metrics[metric];
      const where = `${key}.${metric}`;

      expect(d.p25, where).toBeLessThanOrEqual(d.median);
      expect(d.median, where).toBeLessThanOrEqual(d.p75);
      expect(Number.isFinite(d.median), where).toBe(true);
      expect(['olist', 'prior'], where).toContain(d.source);

      // A prior is n=0 and a measurement is not. Nothing may sit between them.
      if (PRIORS.includes(metric)) expect(d.n, where).toBe(0);
      else expect(d.n, where).toBeGreaterThan(0);
    }
  }
});

test('the two product-level metrics can fall below the order threshold', () => {
  // MIN_ORDERS gates on orders per category; `photos` and `descriptionLength` are
  // counted per distinct product, and a category with 37 orders can have 9 products.
  // Six categories are affected, worst n=9 (tablets_printing_image). The metric still
  // ships — dropping it would make it optional in BenchmarkTable — so anything that
  // quotes a benchmark to a seller reads `n` first. This test pins the exception so
  // it stays a known one.
  const thin = entries.flatMap(([key, row]) =>
    METRICS.filter((m) => row.metrics[m].n > 0 && row.metrics[m].n < 30).map((m) => `${key}.${m}`),
  );

  expect(thin.every((s) => s.endsWith('.photos') || s.endsWith('.descriptionLength'))).toBe(true);
  expect(thin).toHaveLength(12);
});

test('the generated union and the table name the same categories', () => {
  // Compile-time, and the reason this import is the raw JSON rather than the cast
  // export: assigning it to a Record keyed by the union fails to compile the moment
  // `derive.ts` writes a table missing a category the union still declares.
  const exhaustive: Record<OlistCategory, unknown> = raw;

  expect(Object.keys(exhaustive)).toEqual([...Object.keys(exhaustive)].sort());
});

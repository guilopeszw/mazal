import { expect, test } from 'vitest';
import { profileCard } from './index.ts';
import { apparelCard } from '../test/fixtures.ts';
import { sellerBenchmarks } from '@mazal/data';

// 22 of the 62 categories have enough qualifying sellers. health_beauty is one
// of them with 160; books_imported is not — too few shops sell it in volume.
const HEALTH = 'health_beauty' as const;
const card = { ...apparelCard, category: HEALTH };

test('a category with no qualifying sellers gets no profile, rather than a thin one', () => {
  const thin = profileCard({ ...apparelCard, category: 'books_imported' }, sellerBenchmarks);

  expect(thin).toEqual([]);
});

test('places each lever against the sellers in the category', () => {
  const found = profileCard(card, sellerBenchmarks);

  expect(found.length).toBeGreaterThan(0);
  for (const f of found) {
    expect(f.percentile).toBeGreaterThanOrEqual(0);
    expect(f.percentile).toBeLessThanOrEqual(1);
    expect(f.peerMedian).toBeGreaterThan(0);
  }
});

test('a long delivery promise ranks worse than a short one', () => {
  const slow = profileCard({ ...card, deliveryEtaDays: 40 }, sellerBenchmarks)
    .find((f) => f.lever === 'deliveryDays');
  const fast = profileCard({ ...card, deliveryEtaDays: 8 }, sellerBenchmarks)
    .find((f) => f.lever === 'deliveryDays');

  expect(slow!.percentile).toBeGreaterThan(fast!.percentile);
});

test('every finding says whether its lever actually predicts anything', () => {
  const found = profileCard(card, sellerBenchmarks);
  const delivery = found.find((f) => f.lever === 'deliveryDays');
  const freight = found.find((f) => f.lever === 'freightRatio');

  // Delivery replicates in 16 of 18 categories. Freight ratio is a coin flip,
  // and a percentile on it must not be quoted as if it were a lever.
  expect(delivery?.evidence).toBe('replicates');
  expect(freight?.evidence).toBe('inconsistent');
});

test('the worst-placed lever comes first', () => {
  const found = profileCard({ ...card, deliveryEtaDays: 60 }, sellerBenchmarks);

  expect(found[0]!.lever).toBe('deliveryDays');
});

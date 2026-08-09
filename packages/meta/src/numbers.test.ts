import { expect, test } from 'vitest';
import { fromCents, parseMetaCount, parseMetaNumber, splitLargestRemainder, toCents } from './numbers.ts';

test('parses the strings the Graph API actually sends', () => {
  expect(parseMetaNumber('256.62')).toBe(256.62);
  expect(parseMetaNumber('13505')).toBe(13505);
  expect(parseMetaNumber(' 0 ')).toBe(0);
});

test('absence is not zero — every shape of missing returns null', () => {
  // This is the single most important line in the package. Meta omits a field
  // it has no value for, and reading that as zero tells a seller their campaign
  // sold nothing on a day we simply could not read.
  for (const missing of ['', '  ', '—', '--', '-', 'N/A', 'null', null, undefined, 12, {}]) {
    expect(parseMetaNumber(missing)).toBeNull();
  }
});

test('refuses the number formats that belong to a CSV, not to the API', () => {
  // '1.240,50' is pt-BR and '1,240.50' is en-US. Both are real in an Ads
  // Manager export and neither is ever in a JSON payload, so accepting them
  // here would mean guessing which convention a caller meant.
  expect(parseMetaNumber('1.240,50')).toBeNull();
  expect(parseMetaNumber('1,240.50')).toBeNull();
  expect(parseMetaNumber('2.14%')).toBeNull();
});

test('counts must be whole and non-negative', () => {
  expect(parseMetaCount('17')).toBe(17);
  expect(parseMetaCount('17.5')).toBeNull();
  expect(parseMetaCount('-1')).toBeNull();
});

test('money survives a round trip through cents', () => {
  for (const brl of [0, 0.01, 92.78, 256.62, 1240.5, 11117.68]) {
    expect(fromCents(toCents(brl))).toBe(brl);
  }
});

test('a split always sums to the total, for every total and every weighting', () => {
  // Deterministic sweep rather than a fixed handful: the failure mode here is a
  // leftover unit that only appears at certain remainders, and a few hand-picked
  // cases is exactly how that ships.
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let n = 0; n < 200; n++) {
    const total = Math.floor(next() * 1_000_000);
    const weights = Array.from({ length: 2 + Math.floor(next() * 5) }, () => next() + 0.01);
    const parts = splitLargestRemainder(total, weights);

    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
  }
});

test('splits the same input the same way every time', () => {
  const once = splitLargestRemainder(100, [1, 1, 1]);
  expect(splitLargestRemainder(100, [1, 1, 1])).toEqual(once);
  // 100 across three equal weights is 33.33 each: two parts take the leftover
  // unit by index, and which two must never depend on sort stability.
  expect(once).toEqual([34, 33, 33]);
});

test('a zero total gives zeros, and a zero weight gets nothing', () => {
  expect(splitLargestRemainder(0, [3, 1])).toEqual([0, 0]);
  expect(splitLargestRemainder(10, [1, 0])).toEqual([10, 0]);
  expect(splitLargestRemainder(10, [0, 0])).toEqual([0, 0]);
});

test('rejects a total it cannot split honestly', () => {
  expect(() => splitLargestRemainder(10.5, [1, 1])).toThrow(RangeError);
  expect(() => splitLargestRemainder(-1, [1, 1])).toThrow(RangeError);
  expect(() => splitLargestRemainder(10, [1, -1])).toThrow(RangeError);
  expect(() => splitLargestRemainder(10, [])).toThrow(RangeError);
});

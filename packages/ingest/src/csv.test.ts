import { expect, test } from 'vitest';
import { normaliseDate } from './csv.ts';

// C-ingest.md's quirk table: "reject ambiguously if unsure rather than guessing
// day/month". 07/01/2026 is two different days and only the seller knows which.

test('an unambiguous DD/MM date converts without a warning', () => {
  expect(normaliseDate('13/07/2026')).toEqual({ date: '2026-07-13' });
});

test('a second number over 12 forces MM/DD and needs no warning', () => {
  expect(normaliseDate('07/13/2026')).toEqual({ date: '2026-07-13' });
});

test('a date that could be read either way is warned about, not guessed silently', () => {
  const { date, warning } = normaliseDate('07/01/2026');

  expect(date).toBe('2026-01-07');          // DD/MM, what a Brazilian export means
  expect(warning).toMatch(/ambiguous/);
});

test('ISO passes through untouched', () => {
  expect(normaliseDate('2026-07-03')).toEqual({ date: '2026-07-03' });
});

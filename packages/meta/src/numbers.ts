// ─── packages/meta/src/numbers.ts ────────────────────────────────────────
// The arithmetic that can be wrong in silence.
//
// Two jobs, and both of them exist because a number that is nearly right reads
// exactly like a number that is right. Money is held in integer cents so that
// splitting a day across ad sets and adding it back gives the same double it
// started as; counts are split by largest remainder so the parts sum to the
// whole by construction rather than by an adjustment someone can forget.

/**
 * The Graph API sends every number as a string, so this is the only door those
 * strings come through.
 *
 * Deliberately strict: `'12'` and `'12.5'` parse, and `''`, `'—'`, `'N/A'`,
 * `'1,240'`, `null` and `undefined` do not. They return null, which the adapter
 * turns into a named missing field — never into zero. A campaign that spent
 * nothing and a campaign whose spend we failed to read are different facts, and
 * a seller acts on them differently.
 */
export function parseMetaNumber(raw: unknown): number | null {
  // A JSON number is accepted as well as Meta's string. The Graph API sends
  // strings, but this payload also arrives through `diagnose_campaign` from
  // clients that may have round-tripped it through something that normalises
  // numerics — and answering "spend is missing" about a field the caller can
  // see sitting there is a bad error. The strictness that matters is below.
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Same door, for the fields the contract types as integers. */
export function parseMetaCount(raw: unknown): number | null {
  const value = parseMetaNumber(raw);
  if (value === null || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Money, refusing a negative.
 *
 * `spend` and `revenue` are `nonNegativeNumber` at the MCP boundary, so a
 * negative one arriving as `days` is rejected. Letting the same value through
 * the payload door would mean the two routes into the engine disagree about
 * what a valid day is — and a negative spend produces a ROAS that ends up on a
 * slide. Meta does issue credits and refunds; they are not a day's spend.
 */
export function parseMetaMoneyCents(raw: unknown): number | null {
  const value = parseMetaNumber(raw);
  if (value === null || value < 0) return null;
  return toCents(value);
}

/**
 * Money, as integer cents.
 *
 * Every sum in this package happens in cents and converts back once, at the
 * end. Splitting R$256,62 three ways as floats and adding it back gives
 * 256.62000000000003, which is not equal to the 256.62 in the fixture — and the
 * round-trip test that guards this whole package compares with `toEqual`.
 */
export const toCents = (brl: number): number => Math.round(brl * 100);
export const fromCents = (cents: number): number => cents / 100;

/**
 * Split an integer total across weights, by largest remainder.
 *
 * Each part takes the floor of its exact share; the `total - Σfloors` leftover
 * units go to the parts with the largest fractional remainders, ties broken by
 * index so the result is deterministic. The parts sum to the total **by
 * construction** — this is the Hamilton apportionment rule, and the reason to
 * use it rather than rounding each share is that rounding does not sum, and the
 * fix for that is always a patch applied at the end that a later edit drops.
 *
 * Money arrives here already in cents. Zero weights get zero.
 */
export function splitLargestRemainder(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError(`splitLargestRemainder needs a non-negative integer total, got ${total}`);
  }
  if (weights.length === 0) throw new RangeError('splitLargestRemainder needs at least one weight');
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError('splitLargestRemainder needs finite, non-negative weights');
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  // Every weight zero is a caller error everywhere it can happen in this
  // package, but returning zeros beats dividing by zero and shipping NaN counts.
  if (sum === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / sum) * total);
  const parts = exact.map(Math.floor);
  const leftover = total - parts.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((x, i) => ({ remainder: x - Math.floor(x), i }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);

  // `leftover` is always below the number of parts, so this cannot wrap.
  for (let n = 0; n < leftover; n++) {
    const target = byRemainder[n]!;
    parts[target.i] = parts[target.i]! + 1;
  }

  return parts;
}

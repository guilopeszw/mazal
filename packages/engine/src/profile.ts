// ─── packages/engine/src/profile.ts ──────────────────────────────────────
// Where a seller stands among the sellers they compete with.
//
// This is not `diagnose`. `diagnose` asks what broke in a campaign and answers
// from the funnel; this asks what is different about this store and answers from
// the card. They share a data set and nothing else, which is why it is a
// separate export rather than a third ReferenceMode arm — a Finding needs a
// funnel stage, and none of these belong to one.
//
// What it cannot do, and no product can: compare you to a *named* competitor.
// Meta does not expose anyone's campaign performance, and the Ad Library carries
// creative without numbers. What is available is the distribution that
// competitor sits in, which is what this places a card against.

import type { CardFinding, ProductCard, SellerBenchmarkTable, SellerLeverName } from '@mazal/contracts';

/**
 * Which levers actually separate better-reviewed sellers from worse ones, across
 * every category with the data to say.
 *
 * Only delivery replicates — 16 of 18 categories agree on its direction, with
 * better sellers promising about 7% shorter. Price agrees in 11, and freight
 * ratio, photos and description length agree in 9 of 18, which is a coin flip.
 *
 * This ships attached to every finding because a percentile is interesting on
 * its own and misleading without it. A seller told their photo count is p20
 * will go and add photos; the data does not support that changing anything.
 */
const EVIDENCE: Record<SellerLeverName, CardFinding['evidence']> = {
  deliveryDays: 'replicates',
  price: 'inconsistent',
  freightRatio: 'inconsistent',
  photos: 'inconsistent',
  descriptionLength: 'inconsistent',
};

/** Higher is worse for these, so the percentile is read from the top down. */
const LOWER_IS_BETTER = new Set<SellerLeverName>(['price', 'freightRatio', 'deliveryDays']);

const READ: Record<SellerLeverName, (card: ProductCard) => number> = {
  price: (c) => c.price,
  freightRatio: (c) => (c.price === 0 ? 0 : c.shippingCost / c.price),
  deliveryDays: (c) => c.deliveryEtaDays,
  photos: (c) => c.pdpImages,
  descriptionLength: (c) => c.pdpDescriptionLength,
};

/**
 * Percentile from the three quartiles we ship, interpolated. We have p25, median
 * and p75 rather than the raw seller list — committing the list would be
 * publishing per-seller data, and the licence and the taste both say no.
 */
function percentileOf(value: number, q: { p25: number; median: number; p75: number }): number {
  if (value <= q.p25) {
    const span = Math.max(q.median - q.p25, 1e-9);
    return Math.max(0, 0.25 - ((q.p25 - value) / span) * 0.25);
  }
  if (value <= q.median) return 0.25 + ((value - q.p25) / Math.max(q.median - q.p25, 1e-9)) * 0.25;
  if (value <= q.p75) return 0.5 + ((value - q.median) / Math.max(q.p75 - q.median, 1e-9)) * 0.25;

  const span = Math.max(q.p75 - q.median, 1e-9);
  return Math.min(1, 0.75 + ((value - q.p75) / span) * 0.25);
}

/**
 * Findings ordered worst-placed first, so the first line a seller reads is the
 * thing most out of step with their market.
 *
 * A category without enough sellers returns nothing at all. 22 of the 62 have
 * twenty qualifying sellers and 18 have thirty; below that a percentile is
 * arithmetic on too few shops, and saying nothing beats saying something thin.
 */
export function profileCard(card: ProductCard, table: SellerBenchmarkTable): CardFinding[] {
  const row = table[card.category];
  if (!row) return [];

  const findings: CardFinding[] = [];

  for (const lever of Object.keys(READ) as SellerLeverName[]) {
    const q = row.percentiles[lever];
    if (!q || !Number.isFinite(q.median)) continue;

    const observed = READ[lever](card);
    if (!Number.isFinite(observed)) continue;

    const raw = percentileOf(observed, q);
    findings.push({
      lever,
      observed: Math.round(observed * 1e4) / 1e4,
      peerMedian: q.median,
      // Reported so that 1 is always the bad end, whichever direction the lever runs.
      percentile: Math.round((LOWER_IS_BETTER.has(lever) ? raw : 1 - raw) * 1000) / 1000,
      betterSellers: row.levers?.[lever] ?? null,
      evidence: EVIDENCE[lever],
    });
  }

  // Worst first, and a lever that predicts something outranks one that does not
  // at the same percentile — a seller should read the actionable line first.
  return findings.sort((a, b) => {
    const weight = (f: CardFinding) => f.percentile + (f.evidence === 'replicates' ? 0.5 : 0);
    return weight(b) - weight(a);
  });
}

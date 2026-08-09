// ─── packages/engine/src/plan.ts ─────────────────────────────────────────
// Findings become actions the seller approves before anything runs.

import type { Action, Diagnosis, Finding, FaultKind, ProductCard, RecoveryPlan } from '@mazal/contracts';
import { benchmarks } from '@mazal/data';
import { predict } from './predict.ts';

type Template = Omit<Action, 'id' | 'expectedEffect'>;

/**
 * `actor` is not decoration. A dropshipper cannot change a supplier's lead time,
 * so an action that requires it is the seller's and renders as advice with no Run
 * control. When the root cause is outside the seller's reach, the plan
 * recommends *around* it: set the expectation on the page, change the offer,
 * move the audience. Mazal never offers to do what it cannot do.
 */
const PLAYBOOK: Record<FaultKind, Template[]> = {
  none: [],
  stockout: [
    { title: 'Pause the campaign until stock is back', change: 'Set the campaign to paused', confidence: 'high', reversible: true, actor: 'mazal' },
    { title: 'Hide the out-of-stock variant', change: 'Remove the sold-out variant from the product page', confidence: 'high', reversible: true, actor: 'seller' },
  ],
  eta_shock: [
    { title: 'Show the delivery estimate on the product page', change: 'Add the current ETA above the buy button, not at checkout', confidence: 'high', reversible: true, actor: 'seller' },
    { title: 'Offer a free-shipping threshold', change: 'Free shipping above the current average order value', confidence: 'medium', reversible: true, actor: 'seller' },
  ],
  creative_fatigue: [
    { title: 'Refresh the creative', change: 'Rotate in a new primary image and headline', confidence: 'high', reversible: true, actor: 'seller' },
    { title: 'Cap the frequency', change: 'Set a frequency cap of 3 per week and expand the audience', confidence: 'medium', reversible: true, actor: 'mazal' },
  ],
  price_too_high: [
    { title: 'Test a lower price point', change: 'Reduce the listed price toward the category median', confidence: 'medium', reversible: true, actor: 'seller' },
    { title: 'Bundle instead of discounting', change: 'Pair the product with a low-cost add-on at the same total price', confidence: 'low', reversible: true, actor: 'seller' },
  ],
  checkout_friction: [
    { title: 'Test the checkout end to end', change: 'Place a real order and record where it fails', confidence: 'high', reversible: true, actor: 'seller' },
    { title: 'Add a payment method', change: 'Enable Pix if it is not already offered', confidence: 'medium', reversible: true, actor: 'seller' },
  ],
  pixel_break: [
    { title: 'Verify the pixel before spending another real', change: 'Check the purchase event is firing, and the account is not restricted', confidence: 'high', reversible: true, actor: 'seller' },
    { title: 'Pause spend until tracking is confirmed', change: 'Set the campaign to paused', confidence: 'high', reversible: true, actor: 'mazal' },
  ],
  budget_cap: [
    { title: 'Raise the bid or accept lower volume', change: 'Increase the bid cap, or hold the budget and expect fewer impressions', confidence: 'medium', reversible: true, actor: 'mazal' },
  ],
  thin_pdp: [
    { title: 'Add product photos', change: 'Bring the product page to at least six images, including one in use', confidence: 'medium', reversible: true, actor: 'seller' },
    { title: 'Expand the description', change: 'Add sizing, materials and delivery expectations above the fold', confidence: 'medium', reversible: true, actor: 'seller' },
  ],
};

/** Everything that touches the ad account rather than the store. */
const MEDIA_ACTIONS = new Set(['creative_fatigue', 'budget_cap']);

/**
 * What the band becomes if the named stage is restored to its reference.
 *
 * ROAS is a product of its factors, so lifting one factor from `observed` to
 * `reference` scales the whole band by that ratio. This is the same
 * decomposability that lets `predict` name a limiting factor, used in the other
 * direction — and it is the only projection available here, because
 * `buildPlan(diagnosis, card)` is frozen and receives neither the daily series
 * nor a benchmark table.
 *
 * The assumption is stated rather than hidden: it projects the named stage back
 * to the category median and holds every other stage where it is. A plan that
 * fixes two stages at once is worth more than this says, and one whose fix only
 * half lands is worth less.
 */
function projectFixing(finding: Finding, card: ProductCard): RecoveryPlan['projected'] {
  const today = predict({ card, table: benchmarks }).predictedRoas;

  /**
   * How much better the metric gets. A rate improves by rising, so the gain is
   * reference/observed; a cost improves by falling, so it is the other way up.
   *
   * Both branches used to read `reference / observed`, which meant every cost
   * fault produced a ratio below one, was clamped to one by the floor below, and
   * projected no improvement at all — a CPM of 41.8 against a reference of 22
   * showed a seller nothing to gain from fixing it.
   */
  const costMetric = finding.metric === 'cpm' || finding.metric === 'cpa' || finding.metric.startsWith('cost');
  const [gain, base] = costMetric
    ? [finding.observed, finding.reference]
    : [finding.reference, finding.observed];
  const ratio = base <= 0 || gain <= 0 ? 1 : gain / base;

  // A stage at zero would project an infinite recovery. Four times is already a
  // bigger claim than a seller should be shown on one fix.
  const capped = Math.min(Math.max(ratio, 1), 4);
  const round = (x: number) => Math.round(x * 100) / 100;

  return { p10: round(today.p10 * capped), p50: round(today.p50 * capped), p90: round(today.p90 * capped) };
}

export function buildPlan(diagnosis: Diagnosis, card: ProductCard): RecoveryPlan {
  const { primary } = diagnosis;
  if (!primary) return { actions: [], projected: { p10: 0, p50: 0, p90: 0 } };

  const cause = diagnosis.suspectedCause;

  /**
   * The rule the whole product exists to enforce. Telling a seller whose product
   * page is broken to refresh their creative is the failure Mazal is built to
   * prevent, so when the cause is not a media problem the media playbook is not
   * consulted at all — not ranked lower, not consulted.
   */
  const templates = primary.causeLayer === 'media'
    ? PLAYBOOK[cause]
    : PLAYBOOK[MEDIA_ACTIONS.has(cause) ? 'none' : cause];

  const actions: Action[] = templates.map((t, i) => ({
    ...t,
    id: `${cause}.${i}`,
    // What the seller is being promised: this metric, from where it is now, back
    // to where the category says it should be. Both numbers came from a Finding,
    // so both are auditable.
    expectedEffect: { metric: primary.metric, from: primary.observed, to: primary.reference },
  }));

  return { actions, projected: projectFixing(primary, card) };
}

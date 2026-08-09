import type {
  CampaignDay,
  Diagnosis,
  Finding,
  OlistCategory,
  ProductCard,
  ReferenceMode,
} from "@mazal/contracts";
import { aggregate, atcRate, cvr } from "@mazal/contracts/metrics";
import { benchmarks } from "@mazal/data";
import { CHANGE_POINT, buildSeries, splitAtChangePoint } from "./series.ts";

/**
 * Mocks, and deliberately so: `D-frontend.md` says to build the whole screen against
 * fixtures that satisfy the contract and swap in the real call when it lands.
 *
 * One store, one product, two moments in its life — `demo-script.md` §5. Both cases are the
 * same `furniture_decor` product, which is what makes the demo read as one engine rather
 * than two unrelated screenshots.
 *
 * The daily series is the source of truth and every finding is *derived* from it, through
 * `@mazal/contracts/metrics`. Hand-typing an observed value beside a chart drawn from a
 * different array is how the card and the chart end up disagreeing on screen, live — the
 * same failure the "never compute a rate" rule exists to prevent, one level up.
 */

export const DEMO_CATEGORY: OlistCategory = "furniture_decor";

/** The engine reads a seven-day trailing window rather than the whole flight. */
const TRAILING_DAYS = 7;

/**
 * `spread` is the robust sigma, floored at a tenth of the median. In self mode a baseline
 * that barely moved has an IQR near zero, and dividing by it flags nothing — so the engine
 * floors it, and the mock uses the floor so the deviation on screen is the conservative one.
 */
const selfSpread = (reference: number) => reference / 10;

const benchmarkSpread = (q: { p25: number; p75: number }) => (q.p75 - q.p25) / 1.349;

/** The one arithmetic the contract does not own, and it is the definition, not a rate. */
const deviationOf = (observed: number, reference: number, spread: number) =>
  spread === 0 ? 0 : (observed - reference) / spread;

export type DemoCase = {
  id: "case1" | "case2";
  title: string;
  moment: string;
  category: OlistCategory;
  card: ProductCard;
  days: CampaignDay[];
  reference: ReferenceMode;
  diagnosis: Diagnosis;
};

/** Shape and numbers taken from `packages/sim/fixtures/demo-case2.json`'s real card. */
const card: ProductCard = {
  category: DEMO_CATEGORY,
  price: 105.82,
  grossMargin: 0.412,
  shippingCost: 37.21,
  deliveryEtaDays: 23,
  stockOnHand: 158,
  reviewCount: 10,
  reviewAvg: 5,
  pdpImages: 2,
  pdpDescriptionLength: 970,
  returnPolicyDays: 7,
  paymentMethods: ["credit", "debit", "pix", "boleto", "installments"],
  offer: "discount",
};

// ─── Case #1 — pre-flight ────────────────────────────────────────────────────────────
// The seller is about to launch campaign #2 and asks whether they should. Campaign #1's
// numbers were bad from day one — no break to find, just a product page nobody adds to
// cart from. The reference is the category table, so the card has a `Distribution` to
// quote, and `atcRate` is one of the five published priors: what it quotes is an estimate.

const case1Days = buildSeries({ before: 0.011, after: 0.011, changePoint: null });
const case1Window = aggregate(case1Days.slice(-TRAILING_DAYS));
const atcQuantiles = benchmarks[DEMO_CATEGORY].metrics.atcRate;
const cvrQuantiles = benchmarks[DEMO_CATEGORY].metrics.cvr;

const case1Primary: Finding = {
  stage: 3,
  severity: "primary",
  metric: "atcRate",
  observed: atcRate(case1Window),
  reference: atcQuantiles.median,
  spread: benchmarkSpread(atcQuantiles),
  deviation: deviationOf(
    atcRate(case1Window),
    atcQuantiles.median,
    benchmarkSpread(atcQuantiles),
  ),
  sampleSize: case1Window.clicks,
  rule: "stage3.atc_below_reference",
  causeLayer: "product",
};

const case1: DemoCase = {
  id: "case1",
  title: "Antes de lançar",
  moment: "A campanha #2 ainda não rodou. Devo lançar?",
  category: DEMO_CATEGORY,
  card,
  days: case1Days,
  reference: { kind: "benchmark", table: benchmarks },
  diagnosis: {
    primary: case1Primary,
    secondary: [
      {
        stage: 5,
        severity: "secondary",
        metric: "cvr",
        observed: cvr(case1Window),
        reference: cvrQuantiles.median,
        spread: benchmarkSpread(cvrQuantiles),
        deviation: deviationOf(
          cvr(case1Window),
          cvrQuantiles.median,
          benchmarkSpread(cvrQuantiles),
        ),
        sampleSize: case1Window.clicks,
        rule: "stage5.cvr_below_reference",
        causeLayer: "experience",
      },
    ],
    suspectedCause: "thin_pdp",
  },
};

// ─── Case #2 — in-flight ─────────────────────────────────────────────────────────────
// Two good weeks, then the supplier ETA moved and add-to-cart fell off a cliff. The
// reference is the campaign's own baseline, so there is no distribution and no `n` to
// print. This is the case that carries `evidence`, and the evidence is the demo's best
// sentence.

const case2Days = buildSeries();
const { baseline } = splitAtChangePoint(case2Days);
const case2Baseline = aggregate(baseline);
const case2Window = aggregate(case2Days.slice(-TRAILING_DAYS));

const case2Reference = atcRate(case2Baseline);
const case2Observed = atcRate(case2Window);
const case2Spread = selfSpread(case2Reference);

const case2CvrReference = cvr(case2Baseline);
const case2CvrObserved = cvr(case2Window);

const case2: DemoCase = {
  id: "case2",
  title: "Duas semanas depois",
  moment: "Três dias sem uma venda. O que aconteceu?",
  category: DEMO_CATEGORY,
  card,
  days: case2Days,
  reference: { kind: "self", baselineDays: baseline.length },
  diagnosis: {
    primary: {
      stage: 3,
      severity: "primary",
      metric: "atcRate",
      observed: case2Observed,
      reference: case2Reference,
      spread: case2Spread,
      deviation: deviationOf(case2Observed, case2Reference, case2Spread),
      sampleSize: case2Window.clicks,
      rule: "stage3.atc_below_baseline",
      causeLayer: "product",
      evidence: {
        date: CHANGE_POINT,
        type: "eta_change",
        detail: "prazo do fornecedor: 9 dias → 22 dias",
      },
    },
    secondary: [
      {
        stage: 5,
        severity: "secondary",
        metric: "cvr",
        observed: case2CvrObserved,
        reference: case2CvrReference,
        spread: selfSpread(case2CvrReference),
        deviation: deviationOf(
          case2CvrObserved,
          case2CvrReference,
          selfSpread(case2CvrReference),
        ),
        sampleSize: case2Window.clicks,
        rule: "stage5.cvr_below_baseline",
        causeLayer: "experience",
      },
    ],
    suspectedCause: "eta_shock",
    changePoint: { date: CHANGE_POINT, metric: "atcRate" },
  },
};

export const DEMO_CASES = { case1, case2 } as const;

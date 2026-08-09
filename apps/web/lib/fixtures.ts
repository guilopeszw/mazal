import type {
  Action,
  CampaignDay,
  Diagnosis,
  Finding,
  OlistCategory,
  ProductCard,
  ReferenceMode,
  Verdict,
} from "@mazal/contracts";
import { aggregate, atcRate, cvr, icRate } from "@mazal/contracts/metrics";
import { benchmarks } from "@mazal/data";
import { predict } from "@mazal/engine";
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
export const TRAILING_DAYS = 7;

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
  /**
   * From the engine, not from a component. `1 / card.grossMargin` written inline in a page was
   * a rate computed in the UI — the exact thing the rules forbid, and it happened to be the
   * number the whole "don't launch" verdict is measured against. `predict` already owns this
   * definition, so the sheet reads `breakEvenRoas` off a real `Verdict`.
   *
   * Only that field is surfaced. `predictedRoas` from a card with no history comes back with a
   * p90 near 19, which is honest about the band's width and useless on screen; putting it up
   * would be quoting a number nobody should act on.
   */
  verdict: Verdict;
  /**
   * The window the engine judged — the trailing seven days, not the whole flight. The funnel
   * reads its per-stage figures off this, because a row showing the 30-day average beside an
   * `observed` computed over seven prints two different numbers for one metric on one sheet.
   */
  window: CampaignDay;
  actions: Action[];
  /** Prevented waste, or revenue recovered. Derived from the series, never typed in. */
  counter: { label: string; amount: number; basis: string };
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
  verdict: predict({ card, table: benchmarks }),
  window: case1Window,
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
  /**
   * A thin product page is fixed on the page, not in the auction. Claim 3: on a product-layer
   * fault, nothing here touches the campaign — rebuilding the creative is the move this
   * product exists to talk the seller out of.
   */
  actions: [
    {
      id: "pdp-copy",
      title: "Reescrever a descrição em torno de prazo e garantia",
      change: "Substituir o texto do fabricante por 900 caracteres que respondem às três dúvidas do checkout",
      expectedEffect: { metric: "atcRate", from: atcRate(case1Window), to: 0.034 },
      confidence: "medium",
      reversible: true,
      actor: "mazal",
    },
    {
      id: "offer-pix",
      title: "Publicar o desconto à vista no anúncio",
      change: "Mostrar o preço no Pix ao lado do parcelado, em vez de só no checkout",
      expectedEffect: { metric: "cvr", from: cvr(case1Window), to: 0.011 },
      confidence: "low",
      reversible: true,
      actor: "mazal",
    },
    {
      id: "photos",
      title: "Fotografar o produto em uso",
      change: "Subir seis fotos além das duas do catálogo do fornecedor",
      expectedEffect: { metric: "photos", from: card.pdpImages, to: 8 },
      confidence: "high",
      reversible: false,
      actor: "seller",
    },
    {
      id: "reviews",
      title: "Pedir avaliação a quem já comprou",
      change: "Contatar os compradores dos últimos 90 dias",
      expectedEffect: { metric: "reviewAvg", from: 5, to: 5 },
      confidence: "low",
      reversible: false,
      actor: "seller",
    },
  ],
  /**
   * Prevented waste, per `demo-script.md` §4: what the next flight would burn, which is what
   * the last one burned on the same product and the same funnel.
   */
  counter: {
    label: "não gasto",
    amount: aggregate(case1Days).spend,
    basis: "o que a campanha anterior queimou no mesmo funil",
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

/**
 * The plan for an `eta_shock`, and its shape is load-bearing.
 *
 * `docs/acceptance.md` claim 7: for this fault, no `actor: 'mazal'` action may change supplier
 * lead time — a dropshipper cannot, and Mazal must not offer to do what it cannot do. So
 * everything Mazal takes on works *around* the delay: state it on the page, price against it,
 * change the offer. Renegotiating the supplier is real work that has to happen, and it is
 * printed as the seller's, with nothing to tick.
 *
 * Claim 3: the leak is at stage 3, below the media line, so no action here touches the
 * campaign. "People are still clicking" is the finding; pausing the ads would contradict it.
 *
 * **Every `from` is read off the same window the funnel and the apuração read**, and the ETA
 * comes off the product card. Typed literals here printed 0,4% under an arrow while the two
 * blocks above printed 0,6% for the same metric — on the panel the seller actually signs, which
 * is the worst place on the sheet to be caught disagreeing with yourself.
 */
const ETA_NOW = card.deliveryEtaDays;
const ETA_BEFORE = 9; // what the supplier held until the day the change point landed

const case2Actions: Action[] = [
  {
    id: "pdp-eta",
    title: "Declarar o prazo real na página do produto",
    change: `Exibir “chega em até ${ETA_NOW} dias” acima do botão de compra, não no rodapé do checkout`,
    expectedEffect: { metric: "atcRate", from: atcRate(case2Window), to: 0.031 },
    confidence: "medium",
    reversible: true,
    actor: "mazal",
  },
  {
    id: "offer-freight",
    title: "Compensar a espera com frete grátis",
    change: "Frete grátis acima de R$ 150 enquanto o prazo do fornecedor estiver acima de 15 dias",
    expectedEffect: { metric: "icRate", from: icRate(case2Window), to: 0.62 },
    confidence: "medium",
    reversible: true,
    actor: "mazal",
  },
  {
    id: "supplier",
    title: "Renegociar o prazo com o fornecedor",
    change: `Voltar o lead time para os ${ETA_BEFORE} dias praticados até 11 de julho`,
    expectedEffect: { metric: "deliveryDays", from: ETA_NOW, to: ETA_BEFORE },
    confidence: "low",
    reversible: false,
    actor: "seller",
  },
  {
    id: "stock-local",
    title: "Manter estoque local dos dois SKUs que giram",
    change: "Comprar 40 unidades para expedição própria, cortando o fornecedor do caminho",
    expectedEffect: { metric: "deliveryDays", from: ETA_NOW, to: 4 },
    confidence: "medium",
    reversible: false,
    actor: "seller",
  },
];

const case2: DemoCase = {
  id: "case2",
  title: "Duas semanas depois",
  moment: "Três dias sem uma venda. O que aconteceu?",
  category: DEMO_CATEGORY,
  card,
  days: case2Days,
  reference: { kind: "self", baselineDays: baseline.length },
  verdict: predict({ card, table: benchmarks, history: case2Days }),
  window: case2Window,
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
        detail: `prazo do fornecedor: ${ETA_BEFORE} dias → ${ETA_NOW} dias`,
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
  actions: case2Actions,
  /**
   * `demo-script.md` §4: recovered revenue is (days of downtime avoided) × (daily revenue at
   * baseline). Both factors come out of the series — the baseline is the eleven days before
   * the rupture, and the downtime is the days that have run broken since. Typing the script's
   * illustrative figure here instead would be the one invented number on a sheet whose whole
   * argument is that it has none.
   */
  counter: {
    label: "recuperável",
    amount:
      (case2Baseline.revenue / baseline.length) * (case2Days.length - baseline.length),
    basis: `${case2Days.length - baseline.length} dias parados × receita diária da linha de base`,
  },
};

export const DEMO_CASES = { case1, case2 } as const;

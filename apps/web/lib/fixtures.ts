import type { Diagnosis, OlistCategory, ReferenceMode } from "@mazal/contracts";
import { benchmarks } from "@mazal/data";

/**
 * Mocks, and deliberately so: `D-frontend.md` says to build the whole screen against
 * fixtures that satisfy the contract and swap in the real call when it lands.
 *
 * One store, one product, two moments in its life — `demo-script.md` §5. Both cases are
 * the same `furniture_decor` product, which is what makes the demo read as one engine
 * rather than two unrelated screenshots.
 *
 * Every reference value below is the number actually sitting in `packages/data`, and every
 * `deviation` is `(observed − reference) / spread` worked out by hand. A fixture that
 * disagrees with the table it is rendered against would teach me the wrong thing about my
 * own card.
 */

export const DEMO_CATEGORY: OlistCategory = "furniture_decor";

/** `(p75 − p25) / 1.349` — the robust sigma, same definition the engine uses. */
const atc = benchmarks[DEMO_CATEGORY].metrics.atcRate; // median 0.08, prior, n: 0
const cvrRef = benchmarks[DEMO_CATEGORY].metrics.cvr; // median 0.021, prior, n: 0

export type DemoCase = {
  id: "case1" | "case2";
  title: string;
  moment: string;
  category: OlistCategory;
  reference: ReferenceMode;
  diagnosis: Diagnosis;
};

/**
 * Case #1 — pre-flight. The seller is about to launch and asks whether they should. The
 * reference is the category table, so the finding card has a `Distribution` to quote — and
 * `atcRate` is one of the five published priors, so what it quotes is an estimate. That is
 * the honest shape of this claim and the card says so out loud.
 */
const case1: DemoCase = {
  id: "case1",
  title: "Antes de lançar",
  moment: "A campanha #2 ainda não rodou. Devo lançar?",
  category: DEMO_CATEGORY,
  reference: { kind: "benchmark", table: benchmarks },
  diagnosis: {
    primary: {
      stage: 3,
      severity: "primary",
      metric: "atcRate",
      observed: 0.011,
      reference: atc.median, // 0.08
      spread: 0.0556, // (0.12 − 0.045) / 1.349
      deviation: -1.24, // (0.011 − 0.08) / 0.0556
      sampleSize: 1240,
      rule: "stage3.atc_below_reference",
      causeLayer: "product",
    },
    secondary: [
      {
        stage: 5,
        severity: "secondary",
        metric: "cvr",
        observed: 0.003,
        reference: cvrRef.median, // 0.021
        spread: 0.0163, // (0.034 − 0.012) / 1.349
        deviation: -1.1, // (0.003 − 0.021) / 0.0163
        sampleSize: 1240,
        rule: "stage5.cvr_below_reference",
        causeLayer: "experience",
      },
    ],
    suspectedCause: "thin_pdp",
  },
};

/**
 * Case #2 — in-flight. Two good weeks, then three days of nothing. The reference is the
 * campaign's own trailing baseline, so there is no distribution and no `n` to print: the
 * card says "linha de base da própria campanha" rather than inventing a sample size.
 *
 * This is the case that carries `evidence`, and the evidence is the demo's best sentence.
 */
const case2: DemoCase = {
  id: "case2",
  title: "Duas semanas depois",
  moment: "Três dias sem uma venda. O que aconteceu?",
  category: DEMO_CATEGORY,
  reference: { kind: "self", baselineDays: 14 },
  diagnosis: {
    primary: {
      stage: 3,
      severity: "primary",
      metric: "atcRate",
      observed: 0.004,
      reference: 0.068,
      spread: 0.012,
      deviation: -5.33, // (0.004 − 0.068) / 0.012
      sampleSize: 412,
      rule: "stage3.atc_below_baseline",
      causeLayer: "product",
      evidence: {
        date: "2026-07-12",
        type: "eta_change",
        detail: "prazo do fornecedor: 9 dias → 22 dias",
      },
    },
    secondary: [
      {
        stage: 5,
        severity: "secondary",
        metric: "cvr",
        observed: 0.002,
        reference: 0.019,
        spread: 0.0055,
        deviation: -3.09, // (0.002 − 0.019) / 0.0055
        sampleSize: 412,
        rule: "stage5.cvr_below_baseline",
        causeLayer: "experience",
      },
    ],
    suspectedCause: "eta_shock",
    changePoint: { date: "2026-07-12", metric: "atcRate" },
  },
};

export const DEMO_CASES = { case1, case2 } as const;

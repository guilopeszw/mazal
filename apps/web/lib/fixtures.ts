import type { Diagnosis } from "@mazal/contracts";

/**
 * A mock, and deliberately so: `D-frontend.md` says to build the whole screen against a
 * fixture that satisfies `Diagnosis` and swap in the real call when it lands. `satisfies`
 * rather than a type annotation, so the compiler checks the shape without widening it —
 * `primary.stage` stays `3` here instead of collapsing to `FunnelStage`.
 *
 * The numbers are Case #2 from `demo-script.md` §5: add-to-cart fell from 6.8% to 0.4%
 * overnight on the day the supplier ETA moved. `deviation` is `(observed − reference) /
 * spread`, computed by hand so the card cannot render a self-contradicting row.
 */
export const diagnosisFixture = {
  primary: {
    stage: 3,
    severity: "primary",
    metric: "atcRate",
    observed: 0.004,
    reference: 0.068,
    spread: 0.012,
    deviation: -5.33,
    sampleSize: 412,
    rule: "stage3.atc_below_baseline",
    causeLayer: "product",
    evidence: {
      date: "2026-07-12",
      type: "eta_change",
      detail: "ETA do fornecedor: 9 dias → 22 dias",
    },
  },
  secondary: [
    {
      stage: 5,
      severity: "secondary",
      metric: "cvr",
      observed: 0.002,
      reference: 0.021,
      spread: 0.006,
      deviation: -3.17,
      sampleSize: 412,
      rule: "stage5.cvr_below_baseline",
      causeLayer: "experience",
    },
  ],
  suspectedCause: "eta_shock",
  changePoint: { date: "2026-07-12", metric: "atcRate" },
} satisfies Diagnosis;

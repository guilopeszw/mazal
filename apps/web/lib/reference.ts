import type {
  BenchmarkMetric,
  Finding,
  OlistCategory,
  ReferenceMode,
} from "@mazal/contracts";
import { benchmarks } from "@mazal/data";

/**
 * Where a `Finding.reference` came from, in the form the seller has to read it.
 *
 * `D-frontend.md` says to print `Distribution.n` next to every reference value, and
 * `Finding` does not carry it — it has the reference *number* and the denominator of the
 * observed rate, not the sample behind the reference. So the table is read again here.
 *
 * The three arms exist because the honest answer differs by three kinds:
 *
 * - **measured** — an Olist quartile with real orders behind it. Print the n.
 * - **prior** — one of the five published estimates (`cpm`, `ctr`, `cvr`, `atcRate`,
 *   `icRate`), shipped at `n: 0`. Printing "n = 0" reads as a bug or as zero confidence;
 *   both are wrong. It is an estimate, and it says so. See `docs/benchmark-provenance.md`.
 * - **self** — in-flight, where the reference is the campaign's own trailing baseline.
 *   There is no distribution and therefore no n, and inventing one would be the exact
 *   thing `D-frontend.md` forbids.
 */
export type ReferenceProvenance =
  | { kind: "measured"; n: number; label: string }
  | { kind: "prior"; label: string }
  | { kind: "self"; label: string }
  | { kind: "unknown"; label: string };

const BENCHMARK_METRICS = new Set<string>([
  "cpm",
  "ctr",
  "atcRate",
  "icRate",
  "cvr",
  "aov",
  "price",
  "freightRatio",
  "deliveryDays",
  "reviewAvg",
  "photos",
  "descriptionLength",
]);

const isBenchmarkMetric = (metric: string): metric is BenchmarkMetric =>
  BENCHMARK_METRICS.has(metric);

const int = new Intl.NumberFormat("en");

export function provenanceFor(
  finding: Finding,
  category: OlistCategory,
  reference: ReferenceMode,
): ReferenceProvenance {
  if (reference.kind === "self") {
    return {
      kind: "self",
      label: `the campaign's own baseline · ${reference.baselineDays} days`,
    };
  }

  // Not every metric the engine flags has a benchmark row — `cpc`, `costPerAtc`, `roas`
  // and frequency are all derived from stored counts and are not in `BenchmarkMetric`.
  if (!isBenchmarkMetric(finding.metric)) {
    return { kind: "unknown", label: "no reference line for this metric" };
  }

  const distribution = reference.table[category]?.metrics[finding.metric];
  if (!distribution) {
    return { kind: "unknown", label: `no benchmark for ${category}` };
  }

  if (distribution.source === "prior" || distribution.n === 0) {
    return {
      kind: "prior",
      label: "a published estimate for Brazilian retail — not measured",
    };
  }

  return {
    kind: "measured",
    n: distribution.n,
    label: `category median · n = ${int.format(distribution.n)} ${
      distribution.source === "olist" ? "Olist" : "Meta"
    }`,
  };
}

/** The table every non-fixture caller wants. Re-exported so components import one module. */
export { benchmarks };

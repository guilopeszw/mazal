import type { Finding, OlistCategory, ReferenceMode } from "@mazal/contracts";
import {
  EVENT_LABELS,
  denominatorOf,
  formatCount,
  formatDate,
  formatMetric,
  metricLabel,
} from "@/lib/format";
import { provenanceFor } from "@/lib/reference";

/**
 * The audit surface. `D-frontend.md`: a judge should be able to check any claim in five
 * seconds, so the card shows all of it — observed, reference, the sample behind the
 * reference, the sample behind the observation, and the id of the rule that fired.
 *
 * Nothing here is computed. Every number is a field of the `Finding`.
 */
export function FindingCard({
  finding,
  category,
  reference,
}: {
  finding: Finding;
  category: OlistCategory;
  reference: ReferenceMode;
}) {
  const provenance = provenanceFor(finding, category, reference);
  const isPrimary = finding.severity === "primary";

  return (
    <article
      className={`rounded-lg border p-5 ${
        isPrimary ? "border-red-500/40 bg-red-500/5" : "border-neutral-700 bg-neutral-900/40"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium">{metricLabel(finding.metric)}</h3>
        <span className="text-[11px] uppercase tracking-widest text-neutral-500">
          estágio {finding.stage} · {isPrimary ? "causa" : "sintoma"}
        </span>
      </div>

      <dl className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-neutral-500">observado</dt>
          <dd
            className={`text-2xl font-semibold tabular-nums ${isPrimary ? "text-red-400" : ""}`}
          >
            {formatMetric(finding.metric, finding.observed)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-neutral-500">referência</dt>
          <dd className="text-2xl font-semibold tabular-nums text-neutral-300">
            {formatMetric(finding.metric, finding.reference)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-neutral-500">desvio</dt>
          <dd className="text-2xl font-semibold tabular-nums text-neutral-300">
            {finding.deviation.toFixed(1)}σ
          </dd>
        </div>
      </dl>

      {/*
        The provenance line is the accuracy argument. A measured benchmark prints its n; a
        published prior says it is an estimate instead of printing `n = 0`; a self-baseline
        says so, because in-flight there is no distribution to have an n at all.
      */}
      <p
        className={`mt-3 text-xs ${
          provenance.kind === "prior" ? "text-amber-400/90" : "text-neutral-400"
        }`}
      >
        {provenance.kind === "prior" && "⚠ "}
        {provenance.label}
      </p>

      {finding.evidence && (
        <p className="mt-4 rounded border-l-2 border-amber-400/60 bg-amber-400/5 py-2 pl-3 text-sm text-neutral-200">
          Em {formatDate(finding.evidence.date)} houve{" "}
          {EVENT_LABELS[finding.evidence.type] ?? finding.evidence.type} —{" "}
          <span className="text-neutral-100">{finding.evidence.detail}</span>
        </p>
      )}

      <p className="mt-4 flex flex-wrap gap-x-3 text-[11px] text-neutral-500">
        <span>
          {formatCount(finding.sampleSize)} {denominatorOf(finding.metric)}
        </span>
        <span aria-hidden>·</span>
        <span>
          regra <code className="font-mono text-neutral-400">{finding.rule}</code>
        </span>
      </p>
    </article>
  );
}

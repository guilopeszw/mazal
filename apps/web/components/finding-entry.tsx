import type { Finding, OlistCategory, ReferenceMode } from "@mazal/contracts";
import { Field } from "./document/sheet";
import { Stamp } from "./document/stamp";
import {
  EVENT_LABELS,
  denominatorOf,
  formatCount,
  formatDate,
  formatDeviation,
  formatMetric,
  metricLabel,
} from "@/lib/format";
import { provenanceFor } from "@/lib/reference";

/**
 * The audit surface: everything behind one claim, in the form's own vocabulary.
 *
 * Deliberately not a hero metric. The stamp and the funnel row carry the reading-at-distance
 * job; this block is for the judge who leans in, and a form answers that by putting every
 * value in one right-aligned struck column at one size, so they can be compared rather than
 * ranked by typography. Nothing here is computed — every value is a field of the `Finding`.
 */
export function FindingEntry({
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
    <article className="py-4 first:pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          className={`font-form text-lg leading-tight ${isPrimary ? "font-extrabold" : "font-semibold text-ink-soft"}`}
        >
          {metricLabel(finding.metric)}
        </h3>
        <span className="font-struck text-[10px] uppercase tracking-[0.16em] text-ghost">
          estágio {finding.stage} · {isPrimary ? "causa" : "sintoma"}
        </span>
      </div>

      <dl className="mt-2">
        <Field label="observado">
          <span className={isPrimary ? "font-bold text-stamp" : undefined}>
            {formatMetric(finding.metric, finding.observed)}
          </span>
        </Field>
        <Field label="referência">{formatMetric(finding.metric, finding.reference)}</Field>
        <Field label="desvio">{formatDeviation(finding.deviation)}</Field>
        <Field label="amostra">
          {formatCount(finding.sampleSize)} {denominatorOf(finding.metric)}
        </Field>
        <Field label="regra" tone="ghost">
          {finding.rule}
        </Field>
      </dl>

      {/*
        Provenance. A measured Olist quartile and a published industry estimate are not the
        same kind of fact, and the form already has a way to say so: the second one gets
        stamped. Printing "n = 0" instead would read as a bug or as zero confidence, and it is
        neither — `docs/benchmark-provenance.md` has the full picture.
      */}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
        {provenance.kind === "prior" && (
          <Stamp tone="notice" className="text-[9px]">
            estimativa
          </Stamp>
        )}
        <span>{provenance.label}</span>
      </p>

      {/*
        An occurrence, hung in the left margin with its date — how a tracking slip records the
        thing that happened, rather than a tinted callout with a coloured bar down its side.
      */}
      {finding.evidence && (
        <div className="mt-3 grid gap-x-4 gap-y-1 border-t border-rule pt-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
          <p className="font-struck text-[11px] uppercase leading-tight tracking-wider text-ghost">
            ocorrência
            <span className="block text-ink-soft">{formatDate(finding.evidence.date)}</span>
          </p>
          <p className="text-[0.95rem] leading-snug">
            {EVENT_LABELS[finding.evidence.type] ?? finding.evidence.type} —{" "}
            <span className="font-struck text-sm">{finding.evidence.detail}</span>
          </p>
        </div>
      )}
    </article>
  );
}

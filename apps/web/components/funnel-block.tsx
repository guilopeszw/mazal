import type { CampaignDay, FunnelStage } from "@mazal/contracts";
import { BoundaryRule } from "./document/sheet";
import { Stamp } from "./document/stamp";
import { FUNNEL_STAGES, MEDIA_PRODUCT_BOUNDARY, stageValue, toneFor } from "@/lib/funnel";
import { formatMetric } from "@/lib/format";

/**
 * The funnel as a tracking block — seven numbered rows on ruled paper, one of them stamped.
 * This is the object the product is recognised by, so it is the largest thing on the sheet and
 * it carries a number on every row.
 *
 * A Correios tracking slip is already this shape: an ordered sequence of stages where exactly
 * one line says the thing went wrong, and the reader's whole job is to find that line.
 * Borrowing it buys the property the product needs most — the answer is a *row*, not a colour.
 *
 * Three states, and they are three printing operations rather than three hues, so the
 * distinction survives being projected, photographed, or read by someone who cannot separate
 * red from green:
 *
 * - upstream — struck cleanly in impact black, CONFORME.
 * - the leak — stamped in aniline red, heavier and off-square, the only saturated mark.
 * - downstream — the carbon ghost: lighter, and labelled SINTOMA rather than judged, because a
 *   stage below the leak was never independently assessed and printing a verdict there is the
 *   exact misdiagnosis this product exists to prevent.
 */
export function FunnelBlock({
  leak,
  flight,
}: {
  leak: FunnelStage | null;
  flight: CampaignDay;
}) {
  return (
    <div>
      {FUNNEL_STAGES.map(({ stage, label, metrics, unassessed }) => (
        <div key={stage}>
          {stage === MEDIA_PRODUCT_BOUNDARY && (
            <BoundaryRule above="mídia" below="produto · oferta · experiência" />
          )}
          <StageRow
            stage={stage}
            label={label}
            metrics={metrics}
            unassessed={unassessed}
            tone={toneFor(stage, leak)}
            reading={stageValue(stage, flight)}
          />
        </div>
      ))}
    </div>
  );
}

function StageRow({
  stage,
  label,
  metrics,
  unassessed,
  tone,
  reading,
}: {
  stage: FunnelStage;
  label: string;
  metrics: string;
  unassessed?: string;
  tone: "upstream" | "leak" | "downstream";
  reading: { metric: string; value: number } | null;
}) {
  const isLeak = tone === "leak";
  const isGhost = tone === "downstream";

  return (
    <div
      className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_auto] sm:gap-x-5 ${
        isLeak ? "bg-paper-band" : ""
      }`}
    >
      <span
        className={`self-start font-struck text-lg tabular-nums sm:self-center sm:text-xl ${
          isLeak ? "font-bold text-stamp" : isGhost ? "text-ghost" : "text-ink-soft"
        }`}
      >
        {stage}
      </span>

      {/*
        Never truncated. On a narrow screen the stamp and the label compete for the same row and
        the obvious fix renders the leak as "Interesse no pr…" — the name of the stage that broke
        is the answer the whole product exists to produce.
      */}
      <span className="min-w-0">
        <span
          className={`block font-form leading-tight text-balance ${
            isLeak
              ? "text-xl font-extrabold tracking-[-0.015em] text-ink sm:text-[1.75rem]"
              : isGhost
                ? "text-lg text-ghost sm:text-xl"
                : "text-lg font-semibold text-ink sm:text-xl"
          }`}
        >
          {label}
        </span>
        <span
          className={`block text-[10px] uppercase tracking-[0.1em] sm:text-[11px] ${
            isGhost ? "text-ghost" : "text-ink-soft"
          }`}
        >
          {metrics}
        </span>
        {/* A skipped stage says so, and says why. An unexplained blank upstream of the leak is
            a hole in the argument; a disclosed limitation is the argument working. */}
        {unassessed && !reading && (
          <span className="mt-1 block max-w-[52ch] text-[11px] leading-snug text-ink-soft">
            {unassessed}
          </span>
        )}
      </span>

      {/* The reading. A funnel without quantities is a legend, not a diagnosis. */}
      <span
        className={`col-start-2 row-start-2 font-struck tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right ${
          isLeak
            ? "text-2xl font-bold text-stamp sm:text-[1.75rem]"
            : isGhost
              ? "text-base text-ghost"
              : "text-lg text-ink"
        }`}
      >
        {reading ? formatMetric(reading.metric, reading.value) : <span className="text-ghost">—</span>}
      </span>

      <span className="col-start-3 row-start-1 justify-self-end sm:col-start-4">
        {isLeak ? (
          <Stamp tone="verdict" impression="b" className="text-[11px] sm:text-sm">
            vazamento
          </Stamp>
        ) : (
          <span
            className={`font-struck text-[10px] uppercase tracking-[0.14em] sm:text-[11px] ${
              isGhost ? "text-ghost" : "text-ink-soft"
            }`}
          >
            {isGhost ? "sintoma" : reading ? "conforme" : "não avaliado"}
          </span>
        )}
      </span>
    </div>
  );
}

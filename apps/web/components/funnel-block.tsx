import type { FunnelStage } from "@mazal/contracts";
import { BoundaryRule } from "./document/sheet";
import { Stamp } from "./document/stamp";
import { FUNNEL_STAGES, MEDIA_PRODUCT_BOUNDARY, toneFor } from "@/lib/funnel";

/**
 * The funnel as a tracking block — seven numbered rows on ruled paper, one of them stamped.
 *
 * A Correios tracking slip is already this shape: an ordered sequence of stages where exactly
 * one line says the thing went wrong, and the reader's whole job is to find that line. Borrowing
 * it costs nothing and buys the one property the product needs most, which is that the answer
 * is a *row*, not a colour.
 *
 * Three states, and they are three different printing operations rather than three hues, so the
 * distinction survives being projected, photographed, or read by someone who cannot separate red
 * from green:
 *
 * - upstream — struck cleanly in impact black, CONFORME.
 * - the leak — stamped in aniline red, heavier and off-square, the only saturated mark.
 * - downstream — the carbon ghost: lighter, offset a hair, and labelled SINTOMA rather than
 *   judged, because a stage below the leak was never independently assessed and printing a
 *   verdict there is the exact misdiagnosis this product exists to prevent.
 */
export function FunnelBlock({ leak }: { leak: FunnelStage | null }) {
  return (
    <div>
      {FUNNEL_STAGES.map(({ stage, label, metrics }) => {
        const tone = toneFor(stage, leak);
        return (
          <div key={stage}>
            {stage === MEDIA_PRODUCT_BOUNDARY && (
              <BoundaryRule above="mídia" below="produto · oferta · experiência" />
            )}
            <StageRow stage={stage} label={label} metrics={metrics} tone={tone} leak={leak} />
          </div>
        );
      })}
    </div>
  );
}

function StageRow({
  stage,
  label,
  metrics,
  tone,
  leak,
}: {
  stage: FunnelStage;
  label: string;
  metrics: string;
  tone: "upstream" | "leak" | "downstream";
  leak: FunnelStage | null;
}) {
  const isLeak = tone === "leak";
  const isGhost = tone === "downstream";

  return (
    <div
      className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-2.5 sm:gap-x-5 ${
        isLeak ? "bg-paper-band" : ""
      }`}
    >
      <span
        className={`font-struck text-lg tabular-nums ${
          isLeak ? "font-bold text-stamp" : isGhost ? "text-ghost" : "text-ink-soft"
        }`}
      >
        {stage}
      </span>

      {/*
        Never truncated. On a narrow screen the stamp and the label compete for the same row,
        and the obvious fix — `truncate` — renders the leak as "Interesse no pr…". The name of
        the stage that broke is the answer the whole product exists to produce; it wraps.
      */}
      <span className="min-w-0">
        <span
          className={`block font-form text-[1.05rem] leading-tight text-balance sm:text-xl ${
            isLeak
              ? "font-extrabold tracking-[-0.01em] text-ink"
              : isGhost
                ? "text-ghost"
                : "font-semibold text-ink"
          }`}
        >
          {label}
        </span>
        <span
          className={`block text-[11px] uppercase tracking-[0.1em] ${
            isGhost ? "text-ghost" : "text-ink-soft"
          }`}
        >
          {metrics}
        </span>
      </span>

      <span className="justify-self-end">
        {isLeak ? (
          <Stamp tone="verdict" className="text-[11px] sm:text-xs">
            vazamento
          </Stamp>
        ) : (
          <span
            className={`font-struck text-[11px] uppercase tracking-[0.14em] ${
              isGhost ? "text-ghost" : "text-ink-soft"
            }`}
          >
            {isGhost ? "sintoma" : leak === null ? "conforme" : "conforme"}
          </span>
        )}
      </span>
    </div>
  );
}

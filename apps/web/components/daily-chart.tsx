import type { CampaignDay } from "@mazal/contracts";
import { atcRate, cvr, ctr } from "@mazal/contracts/metrics";
import { formatDate, formatMetric, metricLabel } from "@/lib/format";

/**
 * The daily series as a chart-recorder trace on ruled paper.
 *
 * `D-frontend.md` wants this plain — a line, a marker, a date label — and the document world
 * wants the same thing, because an instrument that draws on a moving strip has no vocabulary
 * for tooltips or legends. What it does have is the pen: one continuous stroke that changes
 * colour when the operator swaps the cartridge, which is exactly the before/after a change
 * point needs.
 *
 * Every label is HTML sitting *around* the plot rather than `<text>` inside it. A viewBox that
 * scales to its container scales its type with it, and at 390px a chart drawn at 900 units
 * renders its axis labels at under 5px — legible in the design, illegible on the device, and
 * invisible in a desktop-only screenshot. HTML labels stay at the size they were set.
 *
 * The trace itself is normalised to a 0–100 box and stretched with `preserveAspectRatio="none"`,
 * so it fills whatever width it is given; `vector-effect: non-scaling-stroke` keeps the pen a
 * constant weight instead of smearing with the aspect.
 *
 * Rates come from `@mazal/contracts/metrics`. A `d.addToCarts / d.clicks` here is how the chart
 * and the finding entry start disagreeing about the same day.
 */

const RATE_FNS: Record<string, (d: CampaignDay) => number> = { atcRate, cvr, ctr };

export function DailyChart({
  days,
  metric,
  changePoint,
}: {
  days: CampaignDay[];
  metric: string;
  changePoint?: string;
}) {
  const rateOf = RATE_FNS[metric];
  if (!rateOf || days.length === 0) return null;

  const values = days.map(rateOf);
  const peak = Math.max(...values);
  const ceiling = peak > 0 ? peak * 1.12 : 1;

  const x = (i: number) => (i / Math.max(days.length - 1, 1)) * 100;
  const y = (v: number) => 100 - (v / ceiling) * 100;
  const path = (from: number, to: number) =>
    values
      .slice(from, to)
      .map((v, k) => `${k === 0 ? "M" : "L"} ${x(from + k).toFixed(3)} ${y(v).toFixed(3)}`)
      .join(" ");

  const breakIndex = changePoint ? days.findIndex((d) => d.date === changePoint) : -1;
  const first = days[0]!;
  const last = days[days.length - 1]!;

  return (
    <figure className="mt-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-1">
        <span className="font-form text-sm font-semibold">{metricLabel(metric)} por dia</span>
        <span className="font-struck text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {days.length} dias
        </span>
      </figcaption>

      <div className="mt-3 flex gap-3">
        <div className="flex w-14 shrink-0 flex-col justify-between py-0 text-right font-struck text-[11px] tabular-nums text-ink-soft">
          <span>{formatMetric(metric, ceiling)}</span>
          <span>{formatMetric(metric, 0)}</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="block h-36 w-full sm:h-44"
            role="img"
            aria-label={`${metricLabel(metric)} diária de ${formatDate(first.date)} a ${formatDate(
              last.date,
            )}${changePoint ? `, com ruptura em ${formatDate(changePoint)}` : ""}`}
          >
            <line x1="0" y1="0" x2="100" y2="0" className="stroke-rule" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="100" x2="100" y2="100" className="stroke-rule" vectorEffect="non-scaling-stroke" />

            {/* The pen. Impact black while the campaign held, aniline red from the rupture on. */}
            <path
              d={path(0, breakIndex >= 0 ? breakIndex + 1 : days.length)}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-ink"
            />
            {breakIndex >= 0 && (
              <>
                <path
                  d={path(breakIndex, days.length)}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-stamp"
                />
                <line
                  x1={x(breakIndex)}
                  y1="0"
                  x2={x(breakIndex)}
                  y2="100"
                  strokeWidth={1.5}
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-stamp"
                />
              </>
            )}
          </svg>

          {breakIndex >= 0 && (
            <span
              className="pointer-events-none absolute top-0 -translate-y-1/2 whitespace-nowrap bg-paper px-1.5 font-form text-[11px] font-bold uppercase tracking-[0.1em] text-stamp"
              style={{ left: `${x(breakIndex)}%` }}
            >
              ruptura · {formatDate(changePoint!)}
            </span>
          )}

          <div className="mt-1.5 flex justify-between font-struck text-[10px] uppercase tracking-wider text-ink-soft">
            <span>{formatDate(first.date)}</span>
            <span>{formatDate(last.date)}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

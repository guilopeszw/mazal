import type { CampaignDay } from "@mazal/contracts";
import { atcRate, cvr, ctr } from "@mazal/contracts/metrics";
import { formatDate, formatMetric, metricLabel } from "@/lib/format";

/**
 * The daily series with the change point marked. `D-frontend.md`: keep it plain — a line, a
 * marker, a date label. Case #2 opens on this chart, and the thing it has to make obvious in
 * one second is that the drop is a cliff on a known day, not a slow decline.
 *
 * Inline SVG rather than a chart library: sixty lines, no dependency, and it shares a visual
 * language with the funnel beside it. A library would bring axes and tooltips nobody asked
 * for and a look that does not match.
 *
 * Rates come from `@mazal/contracts/metrics`. A `d.addToCarts / d.clicks` here is how the
 * chart and the finding card start disagreeing about the same day.
 */

const RATE_FNS: Record<string, (d: CampaignDay) => number> = {
  atcRate,
  cvr,
  ctr,
};

const W = 720;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

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
  // A flat series would divide by zero; a series that touches zero still needs headroom.
  const ceiling = peak > 0 ? peak * 1.15 : 1;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(days.length - 1, 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / ceiling) * plotH;

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const area = `${line} L ${x(values.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

  const breakIndex = changePoint ? days.findIndex((d) => d.date === changePoint) : -1;
  const breakValue = breakIndex >= 0 ? values[breakIndex] : undefined;

  const first = days[0]!;
  const last = days[days.length - 1]!;

  return (
    <figure className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium">{metricLabel(metric)} por dia</span>
        {changePoint && (
          <span className="text-xs text-red-400">
            quebrou em {formatDate(changePoint)}
          </span>
        )}
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${metricLabel(metric)} diária de ${formatDate(first.date)} a ${formatDate(last.date)}${
          changePoint ? `, com quebra em ${formatDate(changePoint)}` : ""
        }`}
      >
        {/* Top and bottom rules only. Gridlines a reader does not use are decoration. */}
        {[0, ceiling].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              className="text-neutral-800"
            />
            <text
              x={PAD.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-neutral-500 text-[11px] tabular-nums"
            >
              {formatMetric(metric, v)}
            </text>
          </g>
        ))}

        <path d={area} className="fill-emerald-500/10" />
        <path d={line} fill="none" strokeWidth={2} className="stroke-emerald-400" />

        {breakIndex >= 0 && breakValue !== undefined && (
          <g>
            {/* Everything from the break onward is the broken stretch, drawn in the leak's
                colour so the eye lands on the same red the funnel is using. */}
            <path
              d={values
                .slice(breakIndex)
                .map((v, k) => `${k === 0 ? "M" : "L"} ${x(breakIndex + k)} ${y(v)}`)
                .join(" ")}
              fill="none"
              strokeWidth={2}
              className="stroke-red-500"
            />
            <line
              x1={x(breakIndex)}
              x2={x(breakIndex)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              strokeWidth={1}
              strokeDasharray="3 3"
              className="stroke-red-500/70"
            />
            <circle cx={x(breakIndex)} cy={y(breakValue)} r={4} className="fill-red-500" />
            <text
              x={x(breakIndex) + 8}
              y={PAD.top + 12}
              className="fill-red-400 text-[11px]"
            >
              {formatDate(changePoint!)}
            </text>
          </g>
        )}

        <text x={PAD.left} y={H - 8} className="fill-neutral-500 text-[11px]">
          {formatDate(first.date)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          className="fill-neutral-500 text-[11px]"
        >
          {formatDate(last.date)}
        </text>
      </svg>
    </figure>
  );
}

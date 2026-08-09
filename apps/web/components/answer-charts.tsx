"use client";

import { memo, useMemo } from "react";
import { MotionConfig, useReducedMotion } from "motion/react";
import type { AnswerCharts } from "@/lib/answers";
import { Area, AreaChart } from "./charts/area-chart";
import { useChartStable } from "./charts/chart-context";
import { FunnelChart } from "./charts/funnel-chart";
import { Grid } from "./charts/grid";
import { Line, LineChart } from "./charts/line-chart";
import { ProfitLossLine } from "./charts/profit-loss-line";
import { RadarArea } from "./charts/radar-area";
import { RadarAxis } from "./charts/radar-axis";
import { RadarChart } from "./charts/radar-chart";
import { RadarGrid } from "./charts/radar-grid";
import { RadarLabels } from "./charts/radar-labels";
import { XAxis } from "./charts/x-axis";

/**
 * The four bklit charts, wired to the engine's numbers and nothing else. Every
 * figure follows the same shape: `role="img"` with a spoken summary built on
 * the server, the drawing itself `aria-hidden` — the chart is the picture of
 * numbers the answer already carries in text, never their only carrier.
 *
 * Colour is the funnel's legend and no more: green for what held, red for the
 * leak and the day it broke, ink for everything measured against. Multi-series
 * charts separate by dash and weight, not by a hue of their own.
 *
 * `MotionConfig reducedMotion="user"` covers the springs; the blanket rule in
 * `globals.css` only reaches CSS animations, and these charts animate in JS.
 */

/**
 * The chart shell's x-axis formats dates in the machine's local timezone, and
 * the contract's bare `YYYY-MM-DD` parses as UTC midnight — west of Greenwich
 * that renders as the previous day, the exact off-by-one `formatDate` guards
 * against. Local noon is the same calendar day in every timezone.
 */
const atNoon = (points: { date: string; value: number }[]) =>
  points.map((p) => ({ date: `${p.date}T12:00:00`, value: p.value }));

const TONE_COLOR = {
  ok: "var(--color-accent)",
  leak: "var(--color-warn)",
  after: "var(--color-ink-soft)",
} as const;

export const FunnelFigure = memo(function FunnelFigure({
  chart,
}: {
  chart: NonNullable<AnswerCharts["funnel"]>;
}) {
  const reduced = useReducedMotion();
  return (
    <figure className="m-0 px-3 pb-1 pt-2" role="img" aria-label={chart.summary}>
      <MotionConfig reducedMotion="user">
        <div aria-hidden="true">
          <FunnelChart
            data={chart.slices.map((s) => ({
              label: s.label,
              value: s.value,
              displayValue: s.display,
              color: TONE_COLOR[s.tone],
            }))}
            /* Percentages here would be stage-to-stage rates computed by the
               chart — the engine's job, so they stay off. */
            showPercentage={false}
            /* Five names under five narrow segments collide at 375px; the rows
               beneath carry them in the same order instead. */
            showLabels={false}
            staggerDelay={reduced ? 0 : 0.12}
            enterTransition={reduced ? { duration: 0 } : undefined}
          />
        </div>
      </MotionConfig>
    </figure>
  );
});

/** Dashed red vertical at the engine's change point, labelled with its date. */
function ChangePointMark({ date, label }: { date: string; label?: string }) {
  const { xScale, innerWidth, innerHeight } = useChartStable();
  const x = xScale(new Date(`${date}T12:00:00`)) ?? 0;
  const flip = x > innerWidth / 2;
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={innerHeight}
        stroke="var(--color-warn)"
        strokeWidth={1.5}
        strokeDasharray="4,4"
      />
      {label && (
        <text
          x={flip ? x - 6 : x + 6}
          y={11}
          textAnchor={flip ? "end" : "start"}
          fill="var(--color-warn)"
          fontSize={10.5}
          fontWeight={560}
        >
          {label}
        </text>
      )}
    </g>
  );
}
ChangePointMark.displayName = "ChangePointMark";

export const DailyFigure = memo(function DailyFigure({
  chart,
}: {
  chart: NonNullable<AnswerCharts["daily"]>;
}) {
  const reduced = useReducedMotion();
  const data = useMemo(() => atNoon(chart.points), [chart.points]);
  return (
    <figure className="m-0" role="img" aria-label={chart.summary}>
      <MotionConfig reducedMotion="user">
        <div aria-hidden="true">
          <AreaChart
            data={data}
            animationDuration={reduced ? 0 : 900}
            margin={{ top: 22, right: 24, bottom: 34, left: 24 }}
          >
            <Grid horizontal numTicksRows={3} hideHorizontalEdgeLines />
            <Area
              dataKey="value"
              stroke="var(--color-accent)"
              fill="var(--color-accent)"
              fillOpacity={0.16}
              showHighlight={false}
            />
            {chart.changePoint && (
              <ChangePointMark date={chart.changePoint} label={chart.markLabel} />
            )}
            <XAxis numTicks={4} />
          </AreaChart>
        </div>
      </MotionConfig>
    </figure>
  );
});

export const RoasFigure = memo(function RoasFigure({
  chart,
}: {
  chart: NonNullable<AnswerCharts["margin"]>;
}) {
  const reduced = useReducedMotion();
  const data = useMemo(() => atNoon(chart.points), [chart.points]);
  return (
    <figure className="m-0" role="img" aria-label={chart.summary}>
      <MotionConfig reducedMotion="user">
        <div aria-hidden="true">
          <LineChart
            data={data}
            animationDuration={reduced ? 0 : 900}
            margin={{ top: 22, right: 24, bottom: 34, left: 24 }}
          >
            {/* Registers the y-domain; ProfitLossLine draws and is deliberately
                excluded from domain extraction, so the shell needs one Line. */}
            <Line
              dataKey="value"
              stroke="transparent"
              showHighlight={false}
              animate={false}
              loading={false}
              fadeEdges={false}
            />
            <Grid
              horizontal
              numTicksRows={3}
              hideHorizontalEdgeLines
              /* Zero on this axis is the break-even, drawn in ink: the ruler
                 the line is measured against, not a judgement of its own. */
              highlightRowValues={[0]}
              highlightRowStroke="var(--color-ink)"
            />
            <ProfitLossLine
              dataKey="value"
              positiveColor="var(--color-accent)"
              negativeColor="var(--color-warn)"
            />
            <XAxis numTicks={4} />
          </LineChart>
        </div>
      </MotionConfig>
      <figcaption className="px-4 pb-3 text-[12.5px] text-ink-soft">
        The ink line is your break-even, {chart.breakEven}. Green days paid for
        themselves; red days ran at a loss.
      </figcaption>
    </figure>
  );
});

export const RadarFigure = memo(function RadarFigure({
  chart,
}: {
  chart: NonNullable<AnswerCharts["radar"]>;
}) {
  const reduced = useReducedMotion();
  return (
    <figure className="m-0" role="img" aria-label={chart.summary}>
      <MotionConfig reducedMotion="user">
        {/* RadarChart's own svg is aria-hidden already. */}
        <RadarChart
          className="mx-auto max-w-[320px]"
          data={[
            {
              label: "Category median",
              color: "var(--color-ink-soft)",
              values: chart.peers,
            },
            { label: "This card", color: "var(--color-accent)", values: chart.seller },
          ]}
          metrics={chart.axes}
          animate={!reduced}
        >
          <RadarGrid showLabels={false} stroke="var(--color-line)" strokeOpacity={1} />
          <RadarAxis stroke="var(--color-line)" strokeOpacity={1} />
          <RadarLabels />
          {/* The median separates by dash, not by a hue of its own. */}
          <RadarArea
            index={0}
            showPoints={false}
            showGlow={false}
            className="[stroke-dasharray:4_3]"
          />
          <RadarArea index={1} showGlow={false} />
        </RadarChart>
      </MotionConfig>
      <figcaption className="px-4 pb-3 text-[12.5px] text-ink-soft">
        Further out is better placed among the sellers you compete with. The
        dashed ring is the category median.
      </figcaption>
    </figure>
  );
});

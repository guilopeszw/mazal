"use client";

import { STORE_EVENT_TYPES } from "@mazal/contracts";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { RIM_LAYERS, RIM_STOPS, buildMask, padOf } from "@/lib/ai-lights/mask";
import { FUNNEL_STAGES, MEDIA_PRODUCT_BOUNDARY } from "@/lib/funnel";
import { PLAN_LOADER_CYCLE_MS } from "@/lib/stream";
import "./plan-loader.css";

/**
 * The plan loader: one body that becomes several of Mazal's own working surfaces,
 * lit by a pulse of green light running its rim. Shown only while a plan of
 * action is being drafted — the one moment this product lights its own edge.
 *
 * There is a single element for the life of the card. It animates width, height
 * and corner radius from one surface's shape to the next; the variants are only
 * contents, measured off-screen, and never set their own box. The glow is five
 * canvas-drawn PNG masks (each drawn twice, the second mirrored) stacked under
 * the face — see `lib/ai-lights/mask.ts`, which is the whole trick.
 *
 * Copy here is words, structure and progress states only. The product's claim is
 * that it never estimates, so no variant shows a number the engine did not
 * produce — the one figure on the card, the benchmark category count, is passed
 * through from `OLIST_CATEGORIES.length`.
 */

/** The three beats never overlap: pulse, fade out, morph in the dark, settle. */
const PULSE_MS = 1600;
const FADE_OUT_MS = 160;
/** Mirrored by the 380ms transitions in plan-loader.css. */
const MORPH_MS = 380;
const HANDOVER_AT = PULSE_MS + 120;
const SETTLED_MS = 260;
/**
 * Derived from the beats, never picked by hand: the whole handover has to finish
 * before the next pulse, or the light runs a rim that is still moving and whose
 * mask is still stale.
 */
const GAP_MS = HANDOVER_AT - PULSE_MS + FADE_OUT_MS + MORPH_MS + 80 + SETTLED_MS;
const CYCLE_MS = PULSE_MS + GAP_MS;

// `lib/stream.ts` sizes the plan pause to exactly one of these. If this stops
// matching `PLAN_LOADER_CYCLE_MS`, the pause stops being one clean beat.
if (CYCLE_MS !== PLAN_LOADER_CYCLE_MS) {
  console.warn(
    `plan-loader: cycle is ${CYCLE_MS}ms but stream.ts sizes the pause to ${PLAN_LOADER_CYCLE_MS}ms`,
  );
}
/** Lets the first surface's letters land before the first pulse. */
const LEAD_IN_MS = 400;

type Phase = "lit" | "fading" | "morphing";
type Box = { w: number; h: number; r: number };

const delay = (ms: number): React.CSSProperties => ({ animationDelay: `${ms}ms` });

/** Letters arrive from below on a per-index stagger; remounted every handover by key. */
function Chars({ text, className = "pl-cap" }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {Array.from(text).map((c, i) => (
        <span key={i} className="pl-char" style={delay(i * 20)}>
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}

/**
 * Surface 1 — the funnel walk. `diagnose` checks the seven stages in order and
 * the first one that deviates is the cause; the media │ produto line between
 * stages 2 and 3 is the product's whole thesis, so the loader carries it too.
 * The one figure is real: the benchmark table's category count, passed through
 * from `OLIST_CATEGORIES.length`.
 */
function FunnelWalk({ count }: { count: number }) {
  return (
    <div className="pl-funnel">
      <Chars text="Walking the funnel" />
      <div className="pl-sub pl-rise" style={delay(360)}>
        benchmarks from {count} categories
      </div>
      {FUNNEL_STAGES.map(({ stage, label }, i) => (
        <Fragment key={stage}>
          {stage === MEDIA_PRODUCT_BOUNDARY && (
            <div className="pl-fdiv pl-rise" style={delay(380 + i * 30)}>
              media │ produto
            </div>
          )}
          <div className="pl-frow pl-rise" style={delay(400 + i * 30)}>
            <span
              className="pl-fbar"
              style={{ "--d": `${stage * 340}ms` } as React.CSSProperties}
            />
            {stage} · {label}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Surface 2 — the store's event log, and the polarity flip of the rotation. The
 * engine only names a cause when an event lines up with the change point, and
 * these are the real `StoreEvent` types it listens for, shown as what is being
 * *looked for*, never as something found.
 *
 * Read from `STORE_EVENT_TYPES` rather than typed out. The contract warns that
 * this enum has already been duplicated once and is "one place for them to
 * drift" — and the hand-written copy this replaces had already lost
 * `policy_flag`, so the card was quietly claiming to listen for six things when
 * the engine listens for seven.
 */
const EVENT_ROWS = (() => {
  const names = [...STORE_EVENT_TYPES];
  const rows: string[] = [];
  for (let i = 0; i < names.length; i += 2) rows.push(names.slice(i, i + 2).join(" · "));
  return rows;
})();

function EventLog() {
  return (
    <div className="pl-log">
      <Chars text="Reading the store's event log" />
      <div className="pl-lline pl-rise" style={delay(600)}>
        matching events to the change point
      </div>
      {EVENT_ROWS.map((row, i) => (
        <div key={row} className="pl-lline pl-rise" style={delay(660 + i * 60)}>
          {i === 0 ? `listening: ${row}` : row}
          {i === EVENT_ROWS.length - 1 ? <span className="pl-cursor" /> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Surface 3 — the plan itself taking shape. Skeleton rows, not draft copy: the
 * actions are not decided yet and showing plausible ones would be a claim. The
 * actor split is real structure — every `Action` names who can run it.
 */
function ActionDraft() {
  return (
    <div className="pl-draft">
      <Chars text="Drafting actions for your approval" />
      {[132, 96, 118].map((w, i) => (
        <div key={w} className="pl-drow pl-rise" style={delay(700 + i * 60)}>
          <span className="pl-check" />
          <span className="pl-skel" style={{ "--w": `${w}px` } as React.CSSProperties} />
        </div>
      ))}
      <div className="pl-actors pl-rise" style={delay(900)}>
        every action names its actor
        <span className="pl-chip">mazal</span>
        <span className="pl-chip">seller</span>
      </div>
    </div>
  );
}

export function PlanLoader({ benchmarkCount }: { benchmarkCount: number }) {
  /**
   * The rotation tells the true story in the engine's order: walk the funnel
   * against the benchmarks, read the event log, draft the actions. Three
   * surfaces, because `TIMING.plan` shows exactly three lit beats — a fourth
   * would be a variant that never earns screen time. Radii are resolved to real
   * numbers against the measured box; a 9999 pill-style radius interpolates
   * numerically and snaps at the end of the morph.
   */
  const variants = useMemo(
    () =>
      [
        { key: "funnel", radius: 14, invert: false, node: <FunnelWalk count={benchmarkCount} /> },
        /*
         * `invert: false`, and this is a deliberate loss.
         *
         * The inverted face is `--pl-inv-face`, which in dark mode is #edeae1 —
         * a light card on a dark ground, as designed. But `.pl-content` sits at
         * `opacity: 0` through the fade and morph, so the 380ms background
         * transition painted an empty near-white rectangle on a near-black page
         * for ~200ms: measured at luminance 0.898 against a ground of 0.104.
         * It reads as a hole in the screen, and it is what the white-box report
         * was about.
         *
         * Gating the flip on the settled phase was tried and silently removed
         * the effect instead of retiming it — the log face is never mounted in
         * that phase. Restoring the inversion needs the polarity to change
         * while there is content to see it against; until someone does that,
         * not flipping is the honest version.
         */
        { key: "log", radius: 10, invert: false, node: <EventLog /> },
        { key: "draft", radius: 14, invert: false, node: <ActionDraft /> },
      ] as const,
    [benchmarkCount],
  );

  /** Read once at mount, same as the stream: this component only exists client-side. */
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const probeRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("lit");
  const [litCount, setLitCount] = useState(0);
  const [masks, setMasks] = useState<string[] | null>(null);

  /**
   * Measure every variant's natural box once, off-screen, and again after the
   * fonts arrive — before that every width is the fallback font's. The body
   * needs real px targets because the browser will not transition to `auto`.
   */
  useEffect(() => {
    let alive = true;
    const measure = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const next: Box[] = [];
      probe.querySelectorAll<HTMLElement>(".pl-face").forEach((el, i) => {
        const { width, height } = el.getBoundingClientRect();
        next.push({ w: width, h: height, r: variants[i]!.radius });
      });
      if (alive && next.length === variants.length) setBoxes(next);
    };
    measure();
    document.fonts.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
    };
  }, [variants]);

  /** The clock: one timeout chain per cycle, torn down whole on unmount. */
  useEffect(() => {
    if (!boxes) return;
    let cur = 0;
    let stopped = false;
    const timers: number[] = [];
    const rafs: number[] = [];
    const after = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    const masksFor = (b: Box) =>
      RIM_LAYERS.map((l) =>
        buildMask({
          width: b.w + 2,
          height: b.h + 2,
          radius: b.r,
          strokeWidth: l.strokeWidth,
          blur: l.blur,
          alpha: l.alpha,
          ring: l.ring,
          stops: RIM_STOPS,
        }),
      );

    // Deferred a tick: the first build is still ahead of the first pulse by the
    // whole lead-in, and the linter is right that effects should not set state
    // synchronously.
    after(0, () => setMasks(masksFor(boxes[cur]!)));

    /** Retrigger across two rAFs — in one frame the writes coalesce and nothing restarts. */
    const pulse = () => {
      const glow = glowRef.current;
      if (!glow || reduced) return;
      glow.dataset.playing = "false";
      rafs.push(
        requestAnimationFrame(() =>
          rafs.push(
            requestAnimationFrame(() => {
              glow.dataset.playing = "true";
            }),
          ),
        ),
      );
    };

    const cycle = () => {
      if (stopped) return;
      // Hidden tab: keep checking rather than queueing beats nobody sees.
      if (document.hidden) {
        after(500, cycle);
        return;
      }
      pulse();
      after(HANDOVER_AT, () => setPhase("fading"));
      after(HANDOVER_AT + FADE_OUT_MS, () => {
        cur = (cur + 1) % boxes.length;
        setPhase("morphing");
        setIdx(cur);
      });
      // One mask rebuild, debounced until the shape has settled — never a
      // rebuild per frame. `mask-size: 100% 100%` stretches the old one in the
      // meantime, where display:none keeps anyone from seeing it.
      after(CYCLE_MS, () => {
        setMasks(masksFor(boxes[cur]!));
        setPhase("lit");
        setLitCount((n) => n + 1);
        cycle();
      });
    };

    after(LEAD_IN_MS, cycle);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      rafs.forEach(cancelAnimationFrame);
    };
  }, [boxes, reduced]);

  const v = variants[idx]!;
  const box = boxes?.[idx];

  return (
    <div className="plan-loader">
      {/* The card is ornamental and changes what it is every few seconds, so the
          real status lives here and the card itself is hidden from the reader. */}
      <div role="status" className="sr-only">
        Mazal is drafting a plan of action
      </div>

      <div aria-hidden="true">
        {box && (
          <div className="pl-body" style={{ width: box.w + 2, height: box.h + 2, borderRadius: box.r }}>
            {/* Reduced motion keeps the cycle but the glow never lights. */}
            {!reduced && (
              <div
                ref={glowRef}
                className="pl-glow"
                data-playing="false"
                // display:none, not opacity 0 — ten transparent layers would
                // still be laid out and still rescale their masks every frame
                // of the morph.
                style={{ display: phase === "lit" ? undefined : "none" }}
              >
                {masks &&
                  [1, -1].map((sx) =>
                    RIM_LAYERS.map((l, i) => {
                      // Each layer sits outside the body by its own mask
                      // padding, or the blurred stroke clips square. The lit
                      // arc sits on the right; the mirrored copy lights the
                      // left, or one side stays dark.
                      const pad = padOf(l.strokeWidth, l.blur);
                      return (
                        <div
                          key={`${sx}:${i}`}
                          className="pl-layer"
                          style={{
                            inset: -pad,
                            transform: sx === -1 ? "scaleX(-1)" : undefined,
                            maskImage: `url(${masks[i]})`,
                            WebkitMaskImage: `url(${masks[i]})`,
                          }}
                        />
                      );
                    }),
                  )}
              </div>
            )}
            <div
              className="pl-face"
              data-invert={v.invert ? "true" : undefined}
              style={{ borderRadius: Math.max(box.r - 1, 0) }}
            >
              {/* Keyed on the lit counter so letters arrive on every handover
                  instead of simply appearing. */}
              <div key={litCount} className="pl-content" data-state={phase}>
                {v.node}
              </div>
            </div>
          </div>
        )}

        {/* visibility:hidden, not display:none — a display-none element has no
            box to measure. */}
        <div ref={probeRef} className="pl-probe">
          {variants.map((variant) => (
            <div key={variant.key} className="pl-face">
              {variant.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

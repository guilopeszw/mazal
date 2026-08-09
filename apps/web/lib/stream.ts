import type { Answer } from "./answers.ts";

/**
 * The mocked stream: a pure function of elapsed time to how much of an answer is on screen.
 *
 * Nothing here schedules anything. `buildTimeline` lays an answer out on a millisecond ruler
 * once, and `revealAt` reads that ruler at whatever instant the caller hands it — so the whole
 * animation is a fold over a list, replayable and testable without a clock. The one timer in
 * the app is the single `requestAnimationFrame` loop in `chat.tsx` that supplies the instant.
 */

/** Every duration in one place, so the pace can be tuned without reading the logic. */
/**
 * One full pulse-and-handover of the plan loader: its pulse plus the gap the
 * loader derives from its own beats. Mirrored here because `TIMING` is the only
 * thing that decides how long the pause lasts, and a magic number in this file
 * would silently stop matching the component the first time either moved.
 */
export const PLAN_LOADER_CYCLE_MS = 2600;

export const TIMING = {
  /** The pause after the question, before Mazal starts answering. */
  think: 700,
  /**
   * The pause when the answer carries a plan of action — one full beat of the
   * plan loader, and no more.
   *
   * This was 7000, chosen to walk three of the loader's surfaces. It did not
   * even do that: the loader's cycle is 2600ms, so the third beat was clipped
   * partway into its fade, and nothing in the code related the two numbers.
   *
   * The deeper problem was the number itself. Mazal's whole claim is that the
   * answer is deterministic and already computed; seven seconds of animation in
   * front of it spends that property to buy a light show. One beat says "it is
   * working" and gets out of the way, which is what a loading state is for.
   *
   * Derived from the loader's own cycle rather than typed, so the two cannot
   * drift apart again.
   */
  plan: PLAN_LOADER_CYCLE_MS,
  /** Per word of prose. */
  word: 20,
  /** Per structured block — evidence, a panel, the provenance note. */
  block: 90,
  /** Per row inside a panel, so the funnel walks rather than appears. */
  row: 60,
} as const;

/**
 * Split text into words that carry their own trailing whitespace, so that
 * `tokenize(s).slice(0, n).join("")` is always a prefix of `s` — no lost spaces, no rejoining
 * rules to get wrong.
 *
 * Word granularity is not a stylistic choice, it is the reason this is safe. `AGENTS.md` holds
 * that every number on screen was produced by `packages/engine`; typing "10.9%" one character
 * at a time puts "1", then "10", then "10." in front of the seller — three values the engine
 * never computed, in the one product that claims it never estimates. A token never splits
 * inside a number because a number never contains a space.
 */
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

type StepKind =
  | "verdict"
  | "said"
  | "evidence"
  | "stages"
  | "stageRow"
  | "band"
  | "tableRow"
  | "note";

type Step = { at: number; kind: StepKind };

/** How much of an answer is visible at one instant. */
export type Reveal = {
  /** True during the opening pause, when the answer has not started yet. */
  thinking: boolean;
  verdictWords: number;
  saidWords: number;
  evidence: boolean;
  stages: boolean;
  stageRows: number;
  band: boolean;
  tableRows: number;
  note: boolean;
  done: boolean;
};

/**
 * Lay the answer out on the ruler, in the order `AnswerBody` draws it. Blocks the answer does
 * not carry contribute no steps, so a prediction (band, no funnel) and a diagnosis (funnel, no
 * band) each get a timeline of exactly their own length.
 */
export function buildTimeline(answer: Answer): Step[] {
  const steps: Step[] = [];
  // Drafting a plan is the one wait long enough to show its work — the loader
  // fills it. Everything else keeps the short pause.
  let at = answer.plan ? TIMING.plan : TIMING.think;

  const step = (kind: StepKind, dt: number) => {
    at += dt;
    steps.push({ at, kind });
  };

  for (const segment of answer.verdict) {
    for (let i = 0; i < tokenize(segment.text).length; i++) step("verdict", TIMING.word);
  }
  for (let i = 0; i < tokenize(answer.said).length; i++) step("said", TIMING.word);

  if (answer.evidence) step("evidence", TIMING.block);

  if (answer.stages?.length) {
    step("stages", TIMING.block);
    // Top to bottom, 0 through 6: the reveal walks the funnel down to the leak, which is the
    // one thing the product actually does.
    for (let i = 0; i < answer.stages.length; i++) step("stageRow", TIMING.row);
  }

  if (answer.band) step("band", TIMING.block);
  for (let i = 0; i < answer.rows.length; i++) step("tableRow", TIMING.row);
  step("note", TIMING.block);

  return steps;
}

export function revealAt(steps: Step[], elapsed: number): Reveal {
  const reveal: Reveal = {
    // Thinking until the first word lands, whichever pause this answer took.
    thinking: steps.length > 0 && elapsed < steps[0]!.at,
    verdictWords: 0,
    saidWords: 0,
    evidence: false,
    stages: false,
    stageRows: 0,
    band: false,
    tableRows: 0,
    note: false,
    done: false,
  };

  for (const { at, kind } of steps) {
    if (at > elapsed) break;
    switch (kind) {
      case "verdict":
        reveal.verdictWords++;
        break;
      case "said":
        reveal.saidWords++;
        break;
      case "evidence":
        reveal.evidence = true;
        break;
      case "stages":
        reveal.stages = true;
        break;
      case "stageRow":
        reveal.stageRows++;
        break;
      case "band":
        reveal.band = true;
        break;
      case "tableRow":
        reveal.tableRows++;
        break;
      case "note":
        reveal.note = true;
        break;
    }
  }

  reveal.done = steps.length === 0 || elapsed >= steps[steps.length - 1]!.at;
  return reveal;
}

/** Everything at once: what a finished turn renders, and what anyone who asked for no motion gets. */
export function fullReveal(answer: Answer): Reveal {
  return {
    thinking: false,
    verdictWords: answer.verdict.reduce((n, s) => n + tokenize(s.text).length, 0),
    saidWords: tokenize(answer.said).length,
    evidence: true,
    stages: true,
    stageRows: answer.stages?.length ?? 0,
    band: true,
    tableRows: answer.rows.length,
    note: true,
    done: true,
  };
}

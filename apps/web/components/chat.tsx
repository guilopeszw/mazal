"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { OlistCategory } from "@mazal/contracts";
import type { Answer, AnswerKey } from "@/lib/answers";
import { type Reveal, buildTimeline, fullReveal, revealAt } from "@/lib/stream";
import { AnswerBody } from "./answer";
import { Mark } from "./mark";
import { PlanLoader } from "./plan-loader";
import { MarkButton, Sidebar } from "./sidebar";
import { Upload } from "./upload";

/**
 * The chat shell: landing hero, suggestion chips, composer, transcript. All three answers
 * arrive pre-computed from the server component — the only thing decided in the browser is
 * which one a question routes to.
 */

const CHIPS: { key: AnswerKey; text: string }[] = [
  { key: "diagnose", text: "My ROAS dropped this week" },
  { key: "atc", text: "Why is my ATC rate low?" },
  { key: "predict", text: "Should I launch this campaign?" },
];

function routeOf(question: string): AnswerKey {
  if (/launch|should i|predict/i.test(question)) return "predict";
  if (/atc|add.?to.?cart/i.test(question)) return "atc";
  return "diagnose";
}

/**
 * Drives one answer's reveal from a single `requestAnimationFrame` loop.
 *
 * The loop only advances a clock; `revealAt` does the deciding. That is what keeps this from
 * becoming a pile of chained `setTimeout`s that drift apart and have to be torn down one by
 * one — there is one frame handle to cancel, and a missed frame self-corrects on the next.
 *
 * `active` is false for every turn but the newest, so asking a second question makes the
 * previous answer jump straight to complete instead of two timelines running at once.
 */
function useAnswerStream(answer: Answer, active: boolean): Reveal {
  const steps = useMemo(() => buildTimeline(answer), [answer]);
  const total = steps.length ? steps[steps.length - 1]!.at : 0;

  // Read once, at mount. A turn only exists after a click, so this never runs during the
  // server render and cannot desync hydration.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    /**
     * The blanket rule in `globals.css` flattens CSS animations for this reader but has no
     * opinion about a JS clock — without this branch the prose would still type itself out
     * word by word for someone who asked to be shown no motion at all.
     */
    if (!active || reduced) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const at = now - start;
      setElapsed(at);
      if (at < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, total]);

  if (!active || reduced) return fullReveal(answer);
  return revealAt(steps, elapsed);
}

/** The pause made legible: the mark itself, breathing, and nothing moving. */
function Thinking() {
  return (
    <div role="status" className="flex items-center py-1">
      <Mark className="pulse-mark size-[18px] text-accent" />
      <span className="sr-only">Mazal is thinking</span>
    </div>
  );
}

type Turn = { id: number; asked: string; answer: Answer };

function TurnView({
  turn,
  active,
  benchmarkCount,
}: {
  turn: Turn;
  active: boolean;
  benchmarkCount: number;
}) {
  const reveal = useAnswerStream(turn.answer, active);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rise max-w-[92%] self-end rounded-[18px] rounded-br-[6px] bg-sunken px-4 py-2.5 text-[15px] sm:max-w-[80%]">
        {turn.asked}
      </div>
      {/* The loader appears only when the pending answer carries a plan of
          action — that is the wait it narrates. Every other answer keeps the
          breathing mark. */}
      {reveal.thinking ? (
        turn.answer.plan ? (
          <PlanLoader benchmarkCount={benchmarkCount} />
        ) : (
          <Thinking />
        )
      ) : (
        <AnswerBody answer={turn.answer} reveal={reveal} />
      )}
    </div>
  );
}

export function Chat({
  answers,
  categories,
}: {
  answers: Record<AnswerKey, Answer>;
  /** Passed down rather than imported, so the client never pulls in the contract runtime. */
  categories: readonly OlistCategory[];
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const lastTurn = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  /** Where the composer sat before the first turn moved it — the F of the FLIP below. */
  const cameFrom = useRef<number | null>(null);
  const headerMark = useRef<HTMLButtonElement>(null);

  /** The conversation has begun: the hero is gone and the composer docks to the bottom. */
  const started = turns.length > 0;

  useEffect(() => {
    if (turns.length === 0) return;
    lastTurn.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [turns]);

  /**
   * Closing removes whichever mark was clicked — the panel's twin, or the header's if the key
   * came from elsewhere — so focus has to be handed to the one that survives, or it falls to
   * the body and a keyboard loses its place. The frame is the wait: the header button does not
   * exist in the DOM until React has re-rendered, and `.focus()` on nothing does nothing.
   */
  const closeSidebar = () => {
    setSidebar(false);
    requestAnimationFrame(() => headerMark.current?.focus());
  };

  useEffect(() => {
    if (!sidebar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebar]);

  /**
   * The composer goes from in-flow to fixed the instant the first turn lands, and no CSS
   * transition can cross that — `position` is not an interpolable property. So play the
   * difference back by hand: `ask` records where the bar was standing, this reads where it
   * ended up before the browser has painted either, and the gap becomes a transform that
   * unwinds to zero. The bar is docked the whole time; only its painted position is a lie,
   * and only for as long as the slide.
   *
   * Layout effect, not effect: after paint the bar would already be at the bottom for a
   * frame, and the animation would start by throwing it back up the screen.
   */
  useLayoutEffect(() => {
    const from = cameFrom.current;
    cameFrom.current = null;
    const bar = composer.current;
    if (from === null || !bar) return;
    // The blanket rule in globals.css flattens CSS animations, not this one.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const delta = from - bar.getBoundingClientRect().top;
    if (delta === 0) return;

    bar.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
      // Longer than `rise`'s 320ms because this travels half a screen rather than 6px, and
      // the same curve over that distance reads as a cut rather than a move. The easing is
      // `rise`'s: nearly all the distance is covered early, then it settles.
      duration: 380,
      easing: "cubic-bezier(0.16, 0.84, 0.44, 1)",
    });
  }, [started]);

  const ask = (asked: string, answer: Answer) => {
    // Read here, in the handler: once React has re-rendered, the landing position is gone.
    if (!started) cameFrom.current = composer.current?.getBoundingClientRect().top ?? null;
    setTurns((t) => [...t, { id: t.length, asked, answer }]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const asked = question.trim();
    if (!asked) return;
    ask(asked, answers[routeOf(asked)]);
    setQuestion("");
  };

  return (
    <>
      <Sidebar open={sidebar} onToggle={sidebar ? closeSidebar : () => setSidebar(true)} />

      {/**
       * The shell the sidebar pushes. One custom property drives the whole displacement, and
       * it is declared here so everything below inherits it — including the composer's dock,
       * which is `fixed` and therefore positioned against the viewport rather than against
       * this padding, so it has to read the rail itself.
       *
       * Padding rather than a transform: a transformed ancestor would become the containing
       * block for that same `fixed` dock and would overflow the right edge, and neither is
       * worth the compositor on a tree this small.
       *
       * The rail applies at every width. The panel never lies over the page — it always moves
       * it aside, which on a narrow screen means the reading column pays for the panel while
       * it is open.
       */}
      <div
        className={`pl-[var(--rail)] transition-[padding-left] duration-[240ms] ease-[cubic-bezier(0.16,0.84,0.44,1)] ${
          sidebar ? "[--rail:17rem]" : "[--rail:0px]"
        }`}
      >
        <header className="sticky top-0 z-10 border-b border-line bg-ground px-5 py-3.5">
          {/* h-8 holds the 60px the theme toggle used to hold, now that it lives in the panel.
              The row is duplicated verbatim in the sidebar so the mark lands on the same pixel. */}
          <div className="flex h-8 items-center">
            {!sidebar && (
              <MarkButton open={false} onClick={() => setSidebar(true)} ref={headerMark} />
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[46rem] px-5 pb-32">
          {!started && (
            <section className="flex flex-col items-center pt-[9vh] text-center sm:pt-[17vh]">
              {/* The promise, not the name. With the wordmark moved into the sidebar this is
                  now the only place the product speaks its own case on a cold open, which is
                  the right trade: a judge reads a sentence, not a logo.

                  `luck` is the one word the sentence turns on, so it takes the accent. It was
                  #C9963C, hardcoded: the single raw hex in the components, one value serving
                  both themes, and 2.2:1 on the cream — the token comment said that gold
                  "cannot carry either a thin rule or a word" and then it carried a word at
                  46px. The accent is a token, redefines per theme, and clears the bar in both
                  (5.3:1 light, 6.8:1 dark). */}
              <h1 className="m-0 mb-[30px] font-serif text-[38px] font-medium leading-[1.14] tracking-[-0.012em] text-balance sm:text-[46px]">
                Campaigns shouldn&rsquo;t need <em className="text-accent">luck</em>.
              </h1>
              <div className="mb-[26px] flex max-w-lg flex-wrap justify-center gap-2">
                {CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => ask(chip.text, answers[chip.key])}
                    className="relative rounded-full border border-line bg-raised px-[15px] py-2 text-sm text-ink-soft transition-[border-color,color,scale] duration-150 after:absolute after:-inset-1 hover:border-line-strong hover:text-ink active:scale-[.96]"
                  >
                    {chip.text}
                  </button>
                ))}
              </div>
            </section>
          )}

          {started && (
            <div className="flex flex-col gap-[26px] pt-[34px]">
              {turns.map((turn, i) => (
                <div
                  key={turn.id}
                  ref={i === turns.length - 1 ? lastTurn : undefined}
                  /**
                   * scroll-mt clears the sticky header. Without it `scrollIntoView`
                   * puts the top of the turn exactly under the header, and the
                   * header covers the verdict — the one line the whole answer is
                   * built to deliver.
                   */
                  className="scroll-mt-20"
                >
                  <TurnView
                    turn={turn}
                    active={i === turns.length - 1}
                    benchmarkCount={categories.length}
                  />
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="mt-[26px]">
              <Upload
                categories={categories}
                onAnswer={(answer) => {
                  ask(answer.asked, answer);
                  setUploading(false);
                }}
                onClose={() => setUploading(false)}
              />
            </div>
          )}

          {/**
           * On the landing the composer sits in the flow, directly under the promise and the
           * chips — it is the one thing to do on that screen. The moment there is a transcript
           * it leaves the flow and docks to the bottom of the viewport, because from then on
           * the answer is what moves and the place you type into should not.
           *
           * The dock fades rather than sits on a bar: `from-ground` solid behind the composer,
           * transparent above it, so a turn scrolling past dissolves into the paper instead of
           * being cut by an edge. `main`'s pb-32 is the room this takes up.
           *
           * `left-[var(--rail)]` rather than `inset-x-0`: being fixed, the dock is positioned
           * against the viewport and the shell's padding cannot reach it, so it reads the rail
           * itself and stops at the sidebar's edge instead of running under it.
           */}
          <div
            className={
              started
                ? "fixed right-0 bottom-0 left-[var(--rail)] z-20 bg-linear-to-t from-ground from-60% to-transparent px-5 pt-6 pb-[max(1.125rem,env(safe-area-inset-bottom))] transition-[left] duration-[240ms] ease-[cubic-bezier(0.16,0.84,0.44,1)]"
                : "mt-[26px]"
            }
          >
            {/* Concentric: composer radius 26, inner button 18 with 8px inset. */}
            <form
              ref={composer}
              onSubmit={submit}
              // The shadow is the identity's, tinted 30/40/30 rather than neutral black: a grey
              // shadow on warm paper reads as a cold patch sitting on top of the sheet.
              className="mx-auto flex w-full max-w-[34rem] items-center gap-2 rounded-[26px] border border-line bg-raised p-2 pl-5 shadow-[0_1px_3px_rgb(30_40_30/0.08),0_8px_28px_rgb(30_40_30/0.07)] transition-[border-color] duration-150 focus-within:border-line-strong"
            >
              <button
                type="button"
                onClick={() => setUploading((v) => !v)}
                aria-label="Upload a Meta Ads CSV export"
                aria-expanded={uploading}
                className="relative -ml-2.5 grid size-9 flex-none place-items-center rounded-[18px] text-ink-soft transition-[background-color,color,scale] duration-150 after:absolute after:-inset-1 hover:bg-sunken hover:text-ink active:scale-[.96]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path d="M21.4 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 01-2.82-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What's happening with your campaign?"
                autoComplete="off"
                aria-label="Ask Mazal about your campaign"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-base text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={question.trim() === ""}
                className="relative grid size-9 flex-none place-items-center rounded-[18px] bg-accent text-ground transition-[opacity,scale] duration-150 after:absolute after:-inset-1 active:scale-[.96] disabled:cursor-default disabled:opacity-35"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[15px]"
                  aria-hidden="true"
                >
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          </div>
        </main>
      </div>
    </>
  );
}

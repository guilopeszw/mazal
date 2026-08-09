"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { OlistCategory } from "@mazal/contracts";
import type { Answer, AnswerKey } from "@/lib/answers";
import { type Reveal, buildTimeline, fullReveal, revealAt } from "@/lib/stream";
import { AnswerBody } from "./answer";
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
 * Mazal's clover, sized by the parent.
 *
 * One leaf, drawn once in the top-left quadrant and mirrored into the other three. Keeping it
 * a single path means the four leaves cannot drift out of register at small sizes, which is
 * the whole risk with a mark that has to survive being a 16px favicon.
 */
const LEAF =
  "M3.9 0.5H7.4A3.4 3.4 0 0 1 10.8 3.9V10.8H3.9A3.4 3.4 0 0 1 0.5 7.4V3.9A3.4 3.4 0 0 1 3.9 0.5Z";

const LEAF_MIRRORS = [
  undefined,
  "translate(24 0) scale(-1 1)",
  "translate(0 24) scale(1 -1)",
  "translate(24 24) scale(-1 -1)",
];

function Mark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      {LEAF_MIRRORS.map((transform, i) => (
        <path key={i} d={LEAF} transform={transform} />
      ))}
    </svg>
  );
}

function ThemeToggle() {
  // Resolved after mount: the server cannot know the stored theme, and guessing
  // here would be a hydration mismatch on exactly the attribute the blocking
  // script in the layout just set.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setDark(attr ? attr === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mazal-theme", next);
    } catch {
      // Private mode: the toggle still works for the session.
    }
    setDark(!dark);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="relative grid size-8 place-items-center rounded-lg bg-sunken text-ink-soft transition-[background-color,color,scale] duration-150 after:absolute after:-inset-1.5 hover:bg-line hover:text-ink active:scale-[.96]"
    >
      {dark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[15px]"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[15px]"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      )}
    </button>
  );
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

function TurnView({ turn, active }: { turn: Turn; active: boolean }) {
  const reveal = useAnswerStream(turn.answer, active);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rise max-w-[92%] self-end rounded-[18px] rounded-br-[6px] bg-sunken px-4 py-2.5 text-[15px] sm:max-w-[80%]">
        {turn.asked}
      </div>
      {reveal.thinking ? <Thinking /> : <AnswerBody answer={turn.answer} reveal={reveal} />}
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
  const lastTurn = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  /** Where the composer sat before the first turn moved it — the F of the FLIP below. */
  const cameFrom = useRef<number | null>(null);

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
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ground px-5 py-3.5">
        <div className="flex items-center gap-[9px]">
          {/* The lockup mark: the four leaves in the green themselves, no disc behind them. */}
          <Mark className="size-[17px] flex-none text-accent" />
          <span className="font-serif text-[19px] font-medium leading-none tracking-[-0.01em]">
            Mazal
          </span>
          <span className="rounded-[5px] bg-ref-soft px-[7px] py-[2.5px] text-[10.5px] font-[550] lowercase tracking-[0.04em] text-ref-ink">
            beta
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-[46rem] px-5 pb-32">
        {!started && (
          <section className="flex flex-col items-center pt-[9vh] text-center sm:pt-[17vh]">
            {/* The promise, not the name — the name is already in the header two lines up.
                `luck` is the identity's gold, the one word the sentence turns on. */}
            <h1 className="m-0 mb-[30px] font-serif text-[38px] font-medium leading-[1.14] tracking-[-0.012em] text-balance sm:text-[46px]">
              Campaigns shouldn&rsquo;t need <em className="text-[#C9963C]">luck</em>.
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
                <TurnView turn={turn} active={i === turns.length - 1} />
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
         */}
        <div
          className={
            started
              ? "fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-ground from-60% to-transparent px-5 pt-6 pb-[max(1.125rem,env(safe-area-inset-bottom))]"
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
    </>
  );
}

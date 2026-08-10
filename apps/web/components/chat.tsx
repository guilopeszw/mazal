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
  { key: "allocate", text: "Where should my budget go?" },
];

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

type CardTurn = { id: number; kind: "card"; asked: string; answer: Answer };

type NarrationTurn = {
  id: number;
  kind: "narration";
  asked: string;
  message: string;
  warning?: string;
};

type Turn = CardTurn | NarrationTurn;

type NarrationResponse = {
  message: string;
  conversationId: string;
  warning?: string;
};

function isNarrationResponse(value: unknown): value is NarrationResponse {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record["message"] === "string" &&
    typeof record["conversationId"] === "string" &&
    record["conversationId"].length >= 40 &&
    record["conversationId"].length <= 2_000 &&
    (record["warning"] === undefined || typeof record["warning"] === "string")
  );
}

function CardTurnView({
  turn,
  active,
  benchmarkCount,
}: {
  turn: CardTurn;
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
      <div aria-live="polite">
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
    </div>
  );
}

function NarrationTurnView({ turn }: { turn: NarrationTurn }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="rise max-w-[92%] self-end rounded-[18px] rounded-br-[6px] bg-sunken px-4 py-2.5 text-[15px] sm:max-w-[80%]">
        {turn.asked}
      </div>
      <div
        aria-live="polite"
        className="rise max-w-[92%] self-start rounded-[18px] rounded-bl-[6px] border border-line bg-raised px-4 py-2.5 text-[15px] leading-relaxed text-ink sm:max-w-[80%]"
      >
        <p className="m-0 whitespace-pre-wrap">{turn.message}</p>
        {turn.warning !== undefined && (
          <p className="mt-3 mb-0 text-sm text-ink-soft">
            Narração ao vivo indisponível. Exibindo uma resposta segura verificada.
          </p>
        )}
      </div>
    </div>
  );
}

/** Composer ceiling before it scrolls inside itself, in px. */
const MAX_COMPOSER_PX = 200;

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
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const lastTurn = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const sendingLock = useRef(false);
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
    setTurns((t) => [...t, { id: t.length, kind: "card", asked, answer }]);
  };

  /**
   * The composer is docked to the bottom, so height added to the field grows
   * *upward* and the question stays whole in front of the person writing it.
   * An `<input>` cannot do this at all — it scrolls sideways and hides what you
   * typed, which is what this replaced.
   *
   * Capped: past MAX_COMPOSER_PX the box scrolls internally rather than climbing
   * over the answer it is asking about.
   */
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
    reserveDockRoom();
  };

  /**
   * The docked composer is `fixed`, so it takes no space in the flow and the
   * transcript has to reserve it by hand. A fixed `pb-32` was enough for a
   * one-line bar and hides the end of the answer once the field grows — behind
   * an opaque gradient, so the text is unreachable rather than merely covered.
   *
   * Written to a CSS custom property rather than React state: this runs on
   * every keystroke, and re-rendering the transcript to pad it would be a lot
   * of work to move one number.
   */
  const reserveDockRoom = () => {
    // The dock element, not the form inside it. The dock carries the chrome —
    // `pt-6` and a bottom padding that grows with `env(safe-area-inset-bottom)`
    // — so measuring the form meant guessing that chrome with a constant, and
    // the guess ran 10px short on a phone with a home indicator. Measuring the
    // element that actually occupies the space deletes the guess.
    //
    // Only once docked: on the landing the composer sits in the flow and takes
    // its own space, and reserving for it there adds dead scroll to a page that
    // otherwise does not scroll at all.
    const height = started ? (composer.current?.parentElement?.offsetHeight ?? 0) : 0;
    document.documentElement.style.setProperty("--dock", `${height}px`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const asked = question.trim();
    if (!asked || sendingLock.current) return;

    if (!started) cameFrom.current = composer.current?.getBoundingClientRect().top ?? null;
    sendingLock.current = true;
    setSending(true);
    setQuestion("");
    // The value is controlled but the height is not — clearing one without the
    // other leaves an empty box standing three lines tall.
    if (field.current) field.current.style.height = "auto";
    reserveDockRoom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioKey: "case2",
          userMessage: asked,
          ...(conversationId ? { conversationId } : {}),
        }),
      });
      if (!response.ok) throw new Error("Chat request failed");

      const narration: unknown = await response.json();
      if (!isNarrationResponse(narration)) throw new Error("Invalid chat response");

      setTurns((turns) => [
        ...turns,
        {
          id: turns.length,
          kind: "narration",
          asked,
          message: narration.message,
          ...(narration.warning !== undefined ? { warning: narration.warning } : {}),
        },
      ]);
      setConversationId(narration.conversationId);
    } catch {
      setTurns((turns) => [
        ...turns,
        {
          id: turns.length,
          kind: "narration",
          asked,
          message: "Não foi possível obter uma resposta. Tente novamente.",
        },
      ]);
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
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
       * The rail is nil below `md`, where there is no width to give away. 17rem off a 768px
       * screen is 35% of it and off a phone more than half, and the composer stops fitting
       * outright under 428px — its two 36px buttons and their padding need 156px that the
       * remaining column no longer has. So the panel pushes where pushing leaves a page to
       * read, and lies over the page where it does not.
       */}
      <div
        className={`pl-[var(--rail)] transition-[padding-left] duration-[240ms] ease-[cubic-bezier(0.16,0.84,0.44,1)] ${
          sidebar ? "[--rail:0px] md:[--rail:17rem]" : "[--rail:0px]"
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

        <main className="mx-auto max-w-[46rem] px-5 pb-[max(8rem,var(--dock,0px))]">
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
                  {turn.kind === "card" ? (
                    <CardTurnView
                      turn={turn}
                      active={i === turns.length - 1}
                      benchmarkCount={categories.length}
                    />
                  ) : (
                    <NarrationTurnView turn={turn} />
                  )}
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
              className="mx-auto flex w-full max-w-[34rem] items-end gap-2 rounded-[26px] border border-line bg-raised p-2 pl-5 shadow-[0_1px_3px_rgb(30_40_30/0.08),0_8px_28px_rgb(30_40_30/0.07)] transition-[border-color] duration-150 focus-within:border-line-strong"
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
              <textarea
                ref={field}
                rows={1}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  grow(e.currentTarget);
                }}
                onKeyDown={(e) => {
                  // The Enter that commits an IME candidate is not a send. It
                  // arrives with isComposing true, and treating it as one sends
                  // a half-composed word — in Japanese, Chinese or Korean, most
                  // of the Enters a person presses are this one.
                  if (e.nativeEvent.isComposing) return;
                  // Enter sends, Shift+Enter breaks the line — the convention
                  // every chat box has trained people into.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    composer.current?.requestSubmit();
                  }
                }}
                enterKeyHint="send"
                placeholder="What's happening with your campaign?"
                autoComplete="off"
                aria-label="Ask Mazal about your campaign"
                className="min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-2 text-base leading-6 text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={question.trim() === "" || sending}
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

"use client";

import { useEffect, useRef, useState } from "react";
import type { Answer, AnswerKey } from "@/lib/answers";
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

/** Mazal's spark, sized by the parent. */
function Mark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
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

type Turn = { id: number; asked: string; answer: Answer };

export function Chat({ answers }: { answers: Record<AnswerKey, Answer> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const lastTurn = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length === 0) return;
    lastTurn.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [turns]);

  const ask = (asked: string, answer: Answer) =>
    setTurns((t) => [...t, { id: t.length, asked, answer }]);

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
          {/* text-ground: white-ish on the accent disc in light, near-black in dark. */}
          <span className="grid size-5 flex-none place-items-center rounded-full bg-accent text-ground">
            <Mark className="size-[11px]" />
          </span>
          <span className="text-[15px] font-[560] tracking-[-0.022em]">Mazal</span>
          <span className="rounded-[5px] bg-accent-soft px-[7px] py-[2.5px] text-[10.5px] font-[550] lowercase tracking-[0.04em] text-accent-ink">
            beta
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-[46rem] px-5 pb-32">
        {turns.length === 0 && (
          <section className="flex flex-col items-center pt-[9vh] text-center sm:pt-[17vh]">
            <div className="mb-[22px] grid size-[52px] place-items-center rounded-full bg-accent text-ground" aria-hidden="true">
              <Mark className="size-[22px]" />
            </div>
            <h1 className="m-0 mb-1.5 text-[28px] font-[560] tracking-[-0.035em] sm:text-[34px]">
              Mazal
            </h1>
            <p className="m-0 mb-[30px] text-[15px] text-ink-soft">
              Campaigns shouldn&rsquo;t need luck.
            </p>
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

        {turns.length > 0 && (
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
                className="rise flex scroll-mt-20 flex-col gap-3.5"
              >
                <div className="max-w-[92%] self-end rounded-[18px] rounded-br-[6px] bg-sunken px-4 py-2.5 text-[15px] sm:max-w-[80%]">
                  {turn.asked}
                </div>
                <AnswerBody answer={turn.answer} />
              </div>
            ))}
          </div>
        )}

        {uploading && (
          <div className="mt-[26px]">
            <Upload
              onAnswer={(answer) => {
                ask(answer.asked, answer);
                setUploading(false);
              }}
              onClose={() => setUploading(false)}
            />
          </div>
        )}

        {/* Concentric: composer radius 26, inner button 18 with 8px inset. */}
        <form
          onSubmit={submit}
          className="mx-auto mt-[26px] flex w-full max-w-[34rem] items-center gap-2 rounded-[26px] border border-line bg-raised p-2 pl-5 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_-12px_rgb(0_0_0/0.2)] transition-[border-color] duration-150 focus-within:border-line-strong"
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
      </main>
    </>
  );
}

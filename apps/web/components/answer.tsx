import type { Answer } from "@/lib/answers";
import { type Reveal, fullReveal, tokenize } from "@/lib/stream";

/**
 * One answer turn, rendered exactly as the approved prototype draws it: verdict sentence
 * (the only large type), plain-language line, evidence, funnel, band, metrics table,
 * provenance note. Pure presentation — every string arrives pre-formatted from the server.
 *
 * `reveal` says how much of it is on screen. Omitting it means all of it, so a finished turn
 * and a server render both draw the whole answer without knowing the stream exists. No timer
 * lives in this file.
 */

const BAR: Record<"ok" | "broken" | "mute", string> = {
  ok: "bg-accent",
  broken: "bg-warn",
  mute: "bg-line",
};

export function AnswerBody({ answer, reveal }: { answer: Answer; reveal?: Reveal }) {
  const shown = reveal ?? fullReveal(answer);

  // The word count is global across the verdict, but each segment keeps its own tone, so each
  // one is cut against its own offset. The <em> runs stay exactly as they were.
  let offset = 0;
  const segments = answer.verdict.map((segment) => {
    const tokens = tokenize(segment.text);
    const start = offset;
    offset += tokens.length;
    return { tone: segment.tone, tokens, start };
  });

  return (
    <div className="flex flex-col gap-[13px]" aria-busy={!shown.done}>
      {/* The verdict is the one sentence Mazal says rather than reports, so it is the one
          place the serif appears in an answer. */}
      <p className="m-0 font-serif text-[23px] font-medium leading-[1.3] tracking-[-0.005em]">
        {segments.map((segment, i) => {
          const take = Math.min(segment.tokens.length, Math.max(0, shown.verdictWords - segment.start));
          if (take === 0) return null;
          return (
            <em
              key={i}
              className={`not-italic ${segment.tone === "good" ? "text-accent" : segment.tone === "bad" ? "text-warn" : ""}`}
            >
              {segment.tokens.slice(0, take).join("")}
            </em>
          );
        })}
      </p>

      {shown.saidWords > 0 && (
        <p className="m-0 max-w-[60ch] text-[15px] text-ink-soft">
          {tokenize(answer.said).slice(0, shown.saidWords).join("")}
        </p>
      )}

      {answer.evidence && shown.evidence && (
        <div className="rise flex items-start gap-2.5 rounded-xl bg-accent-soft px-3.5 py-3 text-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-[3px] size-[15px] flex-none text-accent-ink"
            aria-hidden="true"
          >
            <path d="M12 8v5M12 16.5v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <span>{answer.evidence}</span>
        </div>
      )}

      {answer.stages && shown.stages && (
        <section className="rise overflow-hidden rounded-[14px] border border-line bg-raised">
          <h3 className="m-0 border-b border-line bg-sunken px-4 py-[11px] text-[11px] font-[580] uppercase tracking-[0.07em] text-ink-faint">
            Where the funnel breaks
          </h3>
          <div className="flex flex-col">
            {answer.stages.slice(0, shown.stageRows).map((s) => (
              <div
                key={s.name}
                className="rise grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-4 py-[9px] last:border-b-0"
              >
                <span
                  className={`flex items-center gap-[9px] text-sm ${
                    s.state === "broken" ? "font-[540] text-warn" : "text-ink-soft"
                  }`}
                >
                  <span
                    className={`h-[3px] w-[46px] flex-none rounded-[2px] ${BAR[s.state]}`}
                    aria-hidden="true"
                  />
                  {s.name}
                  {s.tag && (
                    <span
                      className={`rounded px-1.5 py-px text-[10.5px] font-[580] uppercase tracking-[0.05em] ${
                        s.state === "broken" ? "bg-warn-soft text-warn" : "bg-sunken text-ink-faint"
                      }`}
                    >
                      {s.tag}
                    </span>
                  )}
                </span>
                <span className="tnum text-[13.5px] text-ink-faint">{s.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {answer.band && shown.band && (
        <section className="rise overflow-hidden rounded-[14px] border border-line bg-raised">
          <h3 className="m-0 border-b border-line bg-sunken px-4 py-[11px] text-[11px] font-[580] uppercase tracking-[0.07em] text-ink-faint">
            Predicted return on ad spend
          </h3>
          <div className="px-4 py-3.5">
            <div className="relative mb-2 mt-[22px] h-1.5 rounded-[3px] bg-sunken">
              <div
                className="absolute h-full rounded-[3px] bg-accent opacity-30"
                style={{ left: `${answer.band.fill.left}%`, width: `${answer.band.fill.width}%` }}
              />
              <div
                className="absolute -top-1 h-3.5 w-0.5 rounded-[1px] bg-accent"
                style={{ left: `${answer.band.mid}%` }}
              />
              {/* Gold, not red: break-even is the threshold the band is measured against, the
                  same job the reference column does. Red stays reserved for the broken stage,
                  so the one red mark on screen is always the leak. */}
              <div
                className="absolute -top-1.5 h-[18px] w-0.5 rounded-[1px] bg-ref"
                style={{ left: `${answer.band.breakEven}%` }}
              >
                <span className="absolute -top-[19px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-[560] text-ref-ink">
                  break-even
                </span>
              </div>
            </div>
            <div className="tnum flex justify-between text-[12.5px] text-ink-faint">
              <span>{answer.band.ends[0]}</span>
              <span>{answer.band.ends[1]}</span>
              <span>{answer.band.ends[2]}</span>
            </div>
          </div>
        </section>
      )}

      {answer.rows.length > 0 && shown.tableRows > 0 && (
        <section className="rise overflow-hidden rounded-[14px] border border-line bg-raised">
          <div className="flex flex-col">
            {answer.rows.slice(0, shown.tableRows).map((r) => (
              <div
                key={r.label}
                className={`rise grid grid-cols-[1fr_auto] items-baseline gap-3.5 border-b border-line px-4 py-2.5 text-sm last:border-b-0 sm:grid-cols-[1fr_auto_auto] ${
                  r.hit ? "bg-warn-soft" : ""
                }`}
              >
                <span className={r.hit ? "text-warn" : "text-ink-soft"}>{r.label}</span>
                <span className={`tnum font-[540] ${r.hit ? "text-warn" : ""}`}>{r.value}</span>
                <span className="tnum hidden text-[13px] text-ink-faint sm:block">{r.ref}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {shown.note && (
        <p className="rise m-0 max-w-[62ch] text-[13px] text-ink-faint">{answer.note}</p>
      )}
    </div>
  );
}

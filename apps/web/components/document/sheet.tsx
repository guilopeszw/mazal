import type { ReactNode } from "react";

/**
 * The document's structural vocabulary.
 *
 * A Brazilian fiscal form organises itself into *quadros* — ruled boxes, each with a title
 * set in the rule itself, holding labelled fields. The grammar is borrowed deliberately and
 * the impersonation stops at the grammar: this sheet is a *parecer de subscrição*, an
 * underwriting opinion, and never claims to be a nota fiscal. That distinction is why the
 * SEM VALOR FISCAL stamp belongs on it — the disclosure the build owes anyway is also the
 * sentence that keeps the borrowed form honest.
 */

/** The sheet. Fixed measure, real edges, sitting on a desk. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl bg-paper text-ink ring-1 ring-paper-edge sheet-shadow">
      {children}
    </div>
  );
}

/**
 * A ruled box with its title cut into the top rule. The title sits *in* the line rather than
 * above it, which is what makes a form read as printed rather than as stacked components.
 */
export function Quadro({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-t border-rule px-5 pb-5 pt-0 sm:px-8 ${className}`}>
      <header className="flex -translate-y-[0.55em] items-center gap-3">
        <h2 className="bg-paper pr-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft">
          {title}
        </h2>
        {aside && (
          <div className="bg-paper px-3 font-struck text-[10px] uppercase tracking-wider text-ghost">
            {aside}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * Label, leader dots, value. The dotted rule is doing a real job — on a wide row it is what
 * stops the eye landing on the wrong value, which is the same job a zebra stripe does with
 * more ink.
 */
export function Field({
  label,
  children,
  tone = "ink",
}: {
  label: string;
  children: ReactNode;
  tone?: "ink" | "ghost";
}) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-ink-soft">
        {label}
      </span>
      <span className="leader h-[0.7em] min-w-4 flex-1" aria-hidden />
      <span
        className={`shrink-0 font-struck text-sm tabular-nums ${
          tone === "ghost" ? "text-ghost" : "text-ink"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * The dividing line between media and everything downstream of it. It is drawn heavier than
 * any other rule on the sheet because it is not a separator — it is the product's argument.
 * Stages above it are the agency's problem; stages below it are the store's.
 */
export function BoundaryRule({ above, below }: { above: string; below: string }) {
  return (
    <div className="my-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1">
      <span className="text-right text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">
        {above}
      </span>
      <span className="h-0 w-8 border-t-2 border-rule-strong" aria-hidden />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">
        {below}
      </span>
    </div>
  );
}

/** A tear-off edge. Everything below it is the strip the seller keeps. */
export function Perforation({ label }: { label?: string }) {
  return (
    <div className="relative py-3" role="separator">
      <div className="perforation h-3" aria-hidden />
      {label && (
        <span className="absolute right-5 top-1/2 -translate-y-1/2 bg-paper px-2 font-struck text-[10px] uppercase tracking-widest text-ghost sm:right-8">
          {label}
        </span>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { CampaignDay, OlistCategory } from "@mazal/contracts";
import {
  categoryDefaults,
  diagnoseUpload,
  preflightUpload,
  parseCsv,
  type InferredNumericField,
} from "@/app/actions";
import type { Answer } from "@/lib/answers";

/**
 * The real entry point for scenario 2: a seller drops their own Meta Ads export.
 *
 * Two steps. Parse (server-side) and show the warnings — they are the honest half of the
 * parse. Then ask for the four card fields the engine actually reads for attribution and
 * show every value Mazal guessed for the rest, visibly marked, editable. A number the
 * product guessed must never look like a number the seller gave.
 */

const STATED = [
  { name: "price", label: "Price (R$)", step: "any", min: "0.01" },
  { name: "shippingCost", label: "Shipping charged (R$)", step: "any", min: "0" },
  { name: "deliveryEtaDays", label: "Delivery ETA (days)", step: "1", min: "0" },
] as const;

const INFERRED: { name: InferredNumericField; label: string; step: string; min: string; max?: string }[] = [
  { name: "grossMargin", label: "Gross margin (0–1)", step: "0.01", min: "0.01", max: "1" },
  { name: "stockOnHand", label: "Stock on hand", step: "1", min: "0" },
  { name: "reviewCount", label: "Reviews", step: "1", min: "0" },
  { name: "reviewAvg", label: "Average rating", step: "0.1", min: "1", max: "5" },
  { name: "pdpImages", label: "Photos on the listing", step: "1", min: "0" },
  { name: "pdpDescriptionLength", label: "Description length (chars)", step: "1", min: "0" },
  { name: "returnPolicyDays", label: "Return policy (days)", step: "1", min: "0" },
];

const STATIC_DEFAULTS: Partial<Record<InferredNumericField, string>> = {
  grossMargin: "0.3",
  stockOnHand: "100",
  reviewCount: "10",
  returnPolicyDays: "7",
};

const input =
  "min-h-11 w-full rounded-[10px] border bg-raised px-3 text-base text-ink placeholder:text-ink-faint";

export function Upload({
  onAnswer,
  onClose,
  categories,
}: {
  onAnswer: (answer: Answer) => void;
  onClose: () => void;
  /** The 62 category names, handed down from the server so this component never
   *  pulls @mazal/contracts into the client bundle. */
  categories: readonly OlistCategory[];
}) {
  const [parsed, setParsed] = useState<{
    fileName: string;
    days: CampaignDay[];
    warnings: string[];
    currency?: string;
  } | null>(null);
  const [category, setCategory] = useState<"" | OlistCategory>("");
  const [assumed, setAssumed] = useState<Partial<Record<InferredNumericField, string>>>(STATIC_DEFAULTS);
  const [edited, setEdited] = useState<ReadonlySet<InferredNumericField>>(new Set());
  const [busy, setBusy] = useState<"parse" | "diagnose" | "preflight" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("parse");
    setError(null);
    try {
      const result = await parseCsv(await file.text());
      setParsed({ fileName: file.name, ...result });
    } catch {
      setError("Could not parse that file.");
    } finally {
      setBusy(null);
    }
  };

  const pickCategory = async (value: OlistCategory) => {
    setCategory(value);
    // The three category-sensitive guesses come from the server; a corrected field is
    // the seller's and is never overwritten by a guess.
    const defaults = await categoryDefaults(value);
    setAssumed((prev) => {
      const next = { ...prev };
      for (const [field, v] of Object.entries(defaults) as [InferredNumericField, number][]) {
        if (!edited.has(field)) next[field] = String(v);
      }
      return next;
    });
  };

  /** The card the form currently describes — the same one both buttons ask about. */
  const statedFrom = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const num = (name: string) => Number(data.get(name));
    return {
      stated: {
        category: category as OlistCategory,
        price: num("price"),
        shippingCost: num("shippingCost"),
        deliveryEtaDays: num("deliveryEtaDays"),
      },
      corrections: Object.fromEntries([...edited].map((f) => [f, Number(assumed[f])])),
    };
  };

  /**
   * "Is this worth advertising?" — the product, not the campaign.
   *
   * It asks nothing of the CSV, which is the point: a seller whose sales happen
   * on iFood or in WhatsApp has no funnel for Mazal to read, and this is the
   * answer that does not need one. Offered beside the diagnosis rather than
   * instead of it, because the seller does not know in advance which of the two
   * their data can support.
   */
  const preflight = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if (!form || category === "") return;
    setBusy("preflight");
    setError(null);
    try {
      const result = await preflightUpload(statedFrom(form));
      if (!result.ok) setError(result.error);
      else onAnswer(result.answer);
    } catch {
      setError("Pre-flight failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!parsed || category === "") return;
    setBusy("diagnose");
    setError(null);
    try {
      const result = await diagnoseUpload({
        fileName: parsed.fileName,
        days: parsed.days,
        ...statedFrom(e.currentTarget),
      });
      if (!result.ok) setError(result.error);
      else onAnswer(result.answer);
    } catch {
      setError("Diagnosis failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rise overflow-hidden rounded-[14px] border border-line bg-raised">
      <h3 className="m-0 flex items-center justify-between border-b border-line bg-sunken px-4 py-2 text-[11px] font-[580] uppercase tracking-[0.07em] text-ink-faint">
        Diagnose your own export
        <button
          type="button"
          onClick={onClose}
          aria-label="Close upload"
          className="relative -my-1 grid size-8 place-items-center rounded-lg text-ink-soft transition-[background-color,color] duration-150 after:absolute after:-inset-1.5 hover:bg-line hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-[14px]" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </h3>

      <div className="flex flex-col gap-4 p-4">
        {!parsed || parsed.days.length === 0 ? (
          <>
            {/* Drop zone AND a real file input — drag-and-drop alone is not accessible. */}
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFile(e.dataTransfer.files[0]);
              }}
              className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft transition-[border-color] duration-150 hover:border-ink-faint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <span className="font-[540] text-ink">
                {busy === "parse" ? "Parsing…" : "Drop your Meta Ads CSV here"}
              </span>
              <span className="text-[13px] text-ink-faint">or press Enter to browse files</span>
            </label>
            {parsed && parsed.days.length === 0 && (
              <Warnings warnings={parsed.warnings.length ? parsed.warnings : ["No daily rows found in that file."]} />
            )}
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <p className="tnum m-0 text-sm text-ink-soft">
              <span className="font-[560] text-ink">{parsed.fileName}</span> — {parsed.days.length}{" "}
              days parsed{parsed.currency ? ` · amounts in ${parsed.currency}` : ""}.
            </p>
            {parsed.warnings.length > 0 && <Warnings warnings={parsed.warnings} />}

            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
              <legend className="mb-1 p-0 text-[11px] font-[580] uppercase tracking-[0.07em] text-ink-faint">
                About the product — 4 fields, that&rsquo;s all
              </legend>
              <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
                Category
                <select
                  required
                  value={category}
                  onChange={(e) => void pickCategory(e.target.value as OlistCategory)}
                  className={`${input} border-line`}
                >
                  <option value="" disabled>
                    Choose a category…
                  </option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] text-ink-faint">
                  Picks which sellers yours is compared against, and the three product details
                  below that Mazal fills in for you. The arithmetic is the same either way.
                  Choose the closest; where the category has too few Olist sellers to
                  measure, Mazal says so on the answer rather than comparing you to a guess.
                </span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {STATED.map((f) => (
                  <label key={f.name} className="flex flex-col gap-1 text-[13px] text-ink-soft">
                    {f.label}
                    <input
                      name={f.name}
                      type="number"
                      required
                      step={f.step}
                      min={f.min}
                      inputMode="decimal"
                      className={`${input} border-line`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
              <legend className="mb-1 p-0 text-[11px] font-[580] uppercase tracking-[0.07em] text-ink-faint">
                Mazal will assume — correct anything wrong
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {INFERRED.map((f) => {
                  const isEdited = edited.has(f.name);
                  return (
                    <label key={f.name} className="flex flex-col gap-1 text-[13px] text-ink-soft">
                      <span className="flex items-center justify-between gap-1">
                        {f.label}
                        <span
                          className={`rounded px-1 py-px text-[10px] font-[580] uppercase tracking-[0.05em] ${
                            isEdited ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-faint"
                          }`}
                        >
                          {isEdited ? "yours" : "guessed"}
                        </span>
                      </span>
                      <input
                        type="number"
                        step={f.step}
                        min={f.min}
                        max={f.max}
                        inputMode="decimal"
                        value={assumed[f.name] ?? ""}
                        placeholder={assumed[f.name] === undefined ? "from category" : undefined}
                        onChange={(e) => {
                          setAssumed((prev) => ({ ...prev, [f.name]: e.target.value }));
                          setEdited((prev) => new Set(prev).add(f.name));
                        }}
                        className={`${input} ${
                          isEdited ? "border-line text-ink" : "border-dashed border-line-strong text-ink-soft"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="m-0 text-[12.5px] text-ink-faint">
                Payment methods and offer type are also assumed (all methods, no offer) — this
                diagnosis never reads them.
              </p>
            </fieldset>

            {error && <p className="m-0 text-[13px] font-[540] text-warn">{error}</p>}

            <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy !== null || category === ""}
              className="flex min-h-11 items-center justify-center self-start rounded-full bg-accent px-5 text-sm font-[540] text-ground transition-[opacity,scale] duration-150 active:scale-[.97] disabled:opacity-40 disabled:active:scale-100"
            >
              {busy === "diagnose" ? "Diagnosing…" : "Diagnose this campaign"}
            </button>
            <button
              type="button"
              onClick={preflight}
              disabled={busy !== null || category === ""}
              title="Reads the product and its category — no campaign data needed"
              className="flex min-h-11 items-center justify-center self-start rounded-full border border-line px-5 text-sm font-[540] text-ink transition-[opacity,scale,border-color] duration-150 hover:border-line-strong active:scale-[.97] disabled:opacity-40 disabled:active:scale-100"
            >
              {busy === "preflight" ? "Checking…" : "Is it worth advertising?"}
            </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/**
 * The honest half of the parse — dropped totals rows, missing columns, ambiguous dates.
 *
 * Red, because these are the one thing on the screen the seller should actually check —
 * a dropped row or an ambiguous date changes what every number below it means. The
 * verdict and the funnel stay neutral; a caution colour is worth having precisely
 * because it is rare.
 */
function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <div className="rounded-[10px] bg-warn-soft px-3.5 py-3 text-[13px] text-warn">
      <p className="m-0 font-[580] uppercase tracking-[0.05em] text-[10.5px]">
        {warnings.length} parser warning{warnings.length === 1 ? "" : "s"}
      </p>
      <ul className="m-0 mt-1 list-disc pl-4">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

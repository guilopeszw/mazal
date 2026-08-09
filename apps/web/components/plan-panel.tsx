"use client";

import { useState } from "react";
import type { Action } from "@mazal/contracts";
import { runPlan, undoRun, unlockExecution } from "@/app/actions";
import { formatMetric, metricLabel } from "@/lib/format";

/**
 * Acceptance claim 10: the plan renders as individually-toggleable actions, three choices —
 * Run all · Edit first · I'll do it myself — execution is logged and receipted, and the
 * screen says out loud that writes are simulated.
 *
 * `actor` is load-bearing. Only `actor: 'mazal'` actions can be toggled and run;
 * `actor: 'seller'` actions render as advice with no control at all, and the difference is
 * written in words, not implied by a missing checkbox. When a plan has no mazal actions —
 * both demo fixtures, honestly — there is nothing to offer to run, so no Run control renders.
 */

type Mode = "choice" | "edit" | "declined";

/** The operation in the words of the API that receives it. */
function describe(op: NonNullable<Action["execution"]>): string {
  switch (op.op) {
    case "pause_campaign":
      return "status: ACTIVE → PAUSED";
    case "reduce_daily_budget":
      return `daily budget × ${op.multiplier} (a reduction — Mazal cannot raise it)`;
    case "set_frequency_cap":
      return `frequency cap: ${op.perWeek} per week`;
  }
}

export function PlanPanel({
  actions,
  projected,
  assumption,
}: {
  actions: Action[];
  projected: string;
  assumption: string;
}) {
  const runnable = actions.filter((a) => a.actor === "mazal");
  const [mode, setMode] = useState<Mode>("choice");
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    code: string;
    count: number;
    mode: "simulated" | "live";
    results: { id: string; detail: string; ok: boolean }[];
    /** Opaque handle — the panel never learns what the undo is. */
    undoToken: string | null;
  } | null>(null);
  const [undone, setUndone] = useState<string[] | null>(null);
  /**
   * Only appears when a run is actually refused. Asking every seller for a
   * secret on load would be a lock on a door that is open in the build almost
   * everyone runs.
   */
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [secret, setSecret] = useState("");
  /** Stable for the life of this panel, so a double-click cannot run twice. */
  const [runKey] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [error, setError] = useState<string | null>(null);

  const selected = runnable.filter((a) => !off.has(a.id));

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      // A server action, not a fetch to /api/execute. That route needs a shared
      // secret before it will touch a real account, and a browser cannot keep
      // one — shipping it to the client would be theatre.
      const data = await runPlan(selected, runKey);
      if (data.locked) {
        setNeedsUnlock(true);
        setError(null);
        return;
      }
      setReceipt({
        code: data.receipt,
        count: selected.length,
        mode: data.mode,
        results: data.results,
        undoToken: data.undoToken,
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not run the plan. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const button =
    "relative flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-[540] transition-[background-color,border-color,color,scale] duration-150 active:scale-[.97] disabled:opacity-40 disabled:active:scale-100";

  return (
    <section className="overflow-hidden rounded-[14px] border border-line bg-raised">
      <h3 className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line bg-sunken px-4 py-[11px] text-[11px] font-[580] uppercase tracking-[0.07em] text-ink-faint">
        The plan
        <span className="tnum normal-case tracking-normal text-ink-soft">{projected}</span>
      </h3>

      <div className="flex flex-col">
        {actions.map((a) => {
          const mazal = a.actor === "mazal";
          const included = mazal && !off.has(a.id);
          return (
            <div key={a.id} className="flex items-start gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={`m-0 text-sm font-[540] ${mazal && !included ? "text-ink-faint line-through" : ""}`}>
                  {a.title}
                </p>
                <p className="m-0 mt-0.5 text-[13px] text-ink-soft">{a.change}</p>
                {a.execution && (
                  /*
                   * The literal change, not the sentence describing it. A seller
                   * consents to what will happen; "pause the campaign until the
                   * ETA recovers" is the reason, `status: ACTIVE -> PAUSED` is
                   * the act. Approving prose is not approving a write.
                   */
                  <p className="tnum m-0 mt-1 text-[12.5px] text-ink-faint">
                    Mazal will send: <span className="text-ink-soft">{describe(a.execution)}</span>
                  </p>
                )}
                <p className="tnum m-0 mt-1 text-[13px] text-ink-soft">
                  {metricLabel(a.expectedEffect.metric)}:{" "}
                  {formatMetric(a.expectedEffect.metric, a.expectedEffect.from)} →{" "}
                  {formatMetric(a.expectedEffect.metric, a.expectedEffect.to)}
                </p>
                <p className="m-0 mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] font-[580] uppercase tracking-[0.05em]">
                  <span className="rounded bg-sunken px-1.5 py-px text-ink-faint">
                    confidence {a.confidence}
                  </span>
                  <span className="rounded bg-sunken px-1.5 py-px text-ink-faint">
                    {a.reversible ? "reversible" : "not reversible"}
                  </span>
                  <span
                    className={`rounded px-1.5 py-px ${
                      mazal ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-faint"
                    }`}
                  >
                    {mazal ? "Mazal can run this" : "yours to do — Mazal can't"}
                  </span>
                </p>
              </div>
              {mazal && mode === "edit" && !receipt && (
                <label className="relative -m-2 flex cursor-pointer items-center p-2 after:absolute after:-inset-1">
                  <span className="sr-only">Include “{a.title}” in the run</span>
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggle(a.id)}
                    className="size-5 accent-[var(--color-accent)]"
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        <p className="m-0 text-[12.5px] text-ink-faint">{assumption}</p>

        {receipt ? (
          <div className="rounded-[10px] border border-line bg-sunken px-3.5 py-3 text-sm">
            <p className="tnum m-0 font-[560] text-ink">
              Receipt {receipt.code} — {receipt.count} action{receipt.count === 1 ? "" : "s"}{" "}
              {receipt.mode === "live" ? "run" : "logged"}.
            </p>
            {/*
              * The mode comes from the server on every run and is never assumed
              * here. "We paused your campaign" and "we wrote this down" are
              * different claims, and only one of them is worth trusting.
              */}
            <p className="m-0 mt-1 text-[13px] text-ink-soft">
              {receipt.mode === "live"
                ? "Sent to Meta. Every action here is reversible, and Mazal will not raise a budget beyond the ceiling you set."
                : "Simulated. This build has no ad-platform credentials — the write went to an approval log and nothing touched your account. The absence is the guarantee."}
            </p>
            {receipt.undoToken && !undone && (
              <button
                type="button"
                onClick={async () => {
                  const r = await undoRun(receipt.undoToken!);
                  if (r.locked) return setNeedsUnlock(true);
                  setUndone(r.details);
                }}
                className="mt-2 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-[540] transition-[background,scale] duration-150 hover:bg-sunken active:scale-[.96]"
              >
                Undo — put it back
              </button>
            )}
            {undone && (
              <ul className="m-0 mt-2 list-disc pl-4 text-[13px] text-ink-soft">
                {undone.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {receipt.results.length > 0 && (
              <ul className="m-0 mt-2 list-disc pl-4 text-[13px] text-ink-soft">
                {receipt.results.map((r) => (
                  <li key={r.id}>{r.detail}</li>
                ))}
              </ul>
            )}
          </div>
        ) : mode === "declined" ? (
          <p className="m-0 text-sm text-ink-soft">
            Nothing will run. The plan is yours to execute at your own pace.
          </p>
        ) : runnable.length === 0 ? (
          <p className="m-0 text-sm text-ink-soft">
            All {actions.length} actions here are yours to do — Mazal has nothing it can run
            for you, so there is nothing to approve.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={run}
                disabled={busy || selected.length === 0}
                className={`${button} bg-accent text-ground`}
              >
                {mode === "edit" ? `Run selected (${selected.length})` : "Run all"}
              </button>
              {mode === "choice" && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className={`${button} border border-line bg-raised text-ink hover:border-line-strong`}
                >
                  Edit first
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("declined")}
                className={`${button} border border-line bg-raised text-ink hover:border-line-strong`}
              >
                I&rsquo;ll do it myself
              </button>
            </div>
            {needsUnlock && (
              <form
                className="flex flex-col gap-2 rounded-[10px] border border-line bg-sunken px-3.5 py-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await unlockExecution(secret);
                  if (!r.ok) return setError("That is not the key for this deployment.");
                  setSecret("");
                  setNeedsUnlock(false);
                  setError(null);
                  await run();
                }}
              >
                <p className="m-0 text-[13px] font-[540]">
                  This build is connected to a real ad account.
                </p>
                <p className="m-0 text-[12.5px] text-ink-soft">
                  Execution stays locked until someone unlocks it, and the unlock lasts fifteen
                  minutes. Nothing has been changed.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Execution key"
                    aria-label="Execution key"
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-full border border-line bg-raised px-3.5 py-2 text-[15px]"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-accent px-4 py-2 text-[13px] font-[560] text-ground transition-[scale] duration-150 active:scale-[.96]"
                  >
                    Unlock
                  </button>
                </div>
              </form>
            )}
            <p className="m-0 text-[12.5px] text-ink-faint">
              Every action here is reversible, and nothing runs until you press the button.
              Without ad-platform credentials this build only writes to an approval log — the
              receipt says which it did.
            </p>
            {error && <p className="m-0 text-[13px] font-[540] text-warn">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}

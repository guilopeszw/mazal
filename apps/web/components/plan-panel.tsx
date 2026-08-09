"use client";

import { useState } from "react";
import type { Action } from "@mazal/contracts";
import { Perforation, Quadro } from "./document/sheet";
import { Stamp } from "./document/stamp";
import { formatBRL, formatMetric, metricLabel } from "@/lib/format";

/**
 * The plan. On a document, a proposal you may accept in part is a list of ticked lines above a
 * signature — and that form solves, for free, the thing this product must never get wrong.
 *
 * An action Mazal can perform gets a box to tick. An action only the seller can perform is
 * printed as A CARGO DO EMITENTE, with no box and no control anywhere near it. The difference
 * is not a badge or a muted colour: one line has an interactive square and the other has bare
 * paper where the square would be, which is legible before a single word is read. Mazal does
 * not offer to change a supplier's lead time, and the sheet cannot be misread as offering it.
 */
export function PlanPanel({
  actions,
  counter,
}: {
  actions: Action[];
  counter: { label: string; amount: number; basis: string };
}) {
  const mazalActions = actions.filter((a) => a.actor === "mazal");
  const sellerActions = actions.filter((a) => a.actor === "seller");

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(mazalActions.map((a) => a.id)),
  );
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const selected = mazalActions.filter((a) => checked.has(a.id));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const effectOf = (action: Action) => edited[action.id] ?? action.expectedEffect.to;

  async function run() {
    setRunning(true);
    setFailed(null);
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actions: selected.map((a) => ({
            ...a,
            expectedEffect: { ...a.expectedEffect, to: effectOf(a) },
          })),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body: { receipt: string } = await response.json();
      setReceipt(body.receipt);
    } catch {
      setFailed("Não foi possível registrar o plano. Nada foi alterado — tente de novo.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Quadro title="plano proposto" aside={`${selected.length} de ${mazalActions.length} marcadas`}>
        <ul className="divide-y divide-rule">
          {mazalActions.map((action) => (
            <MazalRow
              key={action.id}
              action={action}
              checked={checked.has(action.id)}
              onToggle={() => toggle(action.id)}
              editing={editing}
              value={effectOf(action)}
              onChange={(v) => setEdited((prev) => ({ ...prev, [action.id]: v }))}
            />
          ))}
        </ul>

        {sellerActions.length > 0 && (
          <>
            <p className="mt-6 border-t border-rule pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
              a cargo do emitente
            </p>
            <p className="mb-2 max-w-[62ch] text-[12px] leading-snug text-ink-soft">
              Fora do alcance do Mazal. Sem caixa para marcar, porque não há o que executar aqui.
            </p>
            <ul className="divide-y divide-rule">
              {sellerActions.map((action) => (
                <SellerRow key={action.id} action={action} />
              ))}
            </ul>
          </>
        )}

        <div className="mt-6 flex flex-col gap-4 border-t-2 border-rule-strong pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-struck text-[11px] uppercase tracking-[0.16em] text-ink-soft">
              {counter.label}
            </p>
            <p className="font-form text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
              {formatBRL(counter.amount)}
            </p>
            <p className="mt-0.5 max-w-[40ch] text-[11px] leading-snug text-ink-soft">
              {counter.basis}
            </p>
          </div>

          {/*
            Three controls, in the order and the wording `D-frontend.md` fixes. They are
            English inside a pt-BR sheet because the brief pins them, and they are the line the
            demo pauses on: it proposes, you decide.
          */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={run}
              disabled={running || selected.length === 0}
              className="border-2 border-ink bg-ink px-5 py-2.5 font-form text-sm font-bold uppercase tracking-[0.1em] text-paper transition-colors hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-ghost"
            >
              {running ? "registrando…" : "Run all"}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              className="border-b-2 border-ink pb-0.5 font-form text-sm font-semibold text-ink transition-colors hover:border-stamp hover:text-stamp focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp aria-pressed:border-stamp aria-pressed:text-stamp"
            >
              Edit first
            </button>
            <span className="font-form text-sm text-ink-soft">I&rsquo;ll do it myself</span>
          </div>
        </div>

        {failed && (
          <p role="alert" className="mt-3 font-form text-sm font-semibold text-stamp">
            {failed}
          </p>
        )}
      </Quadro>

      {receipt && <Protocolo receipt={receipt} count={selected.length} />}
    </>
  );
}

/** A ticked line. The box is the affordance and the effect is the argument for ticking it. */
function MazalRow({
  action,
  checked,
  onToggle,
  editing,
  value,
  onChange,
}: {
  action: Action;
  checked: boolean;
  onToggle: () => void;
  editing: boolean;
  value: number;
  onChange: (value: number) => void;
}) {
  const { metric, from } = action.expectedEffect;

  return (
    <li className="py-3">
      <div className="flex gap-3 sm:gap-4">
        <input
          type="checkbox"
          id={`action-${action.id}`}
          checked={checked}
          onChange={onToggle}
          className="mt-1 size-[1.1rem] shrink-0 cursor-pointer appearance-none border-2 border-ink bg-transparent checked:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stamp"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`action-${action.id}`}
            className={`block cursor-pointer font-form text-[1.05rem] font-semibold leading-tight ${
              checked ? "text-ink" : "text-ink-soft line-through decoration-rule-strong"
            }`}
          >
            {action.title}
          </label>
          <p className="mt-0.5 max-w-[64ch] text-[13px] leading-snug text-ink-soft">
            {action.change}
          </p>

          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-struck text-[11px] text-ink-soft">
            <span>
              {metricLabel(metric)} {formatMetric(metric, from)} →{" "}
              <span className="font-bold text-ink">{formatMetric(metric, value)}</span>
            </span>
            <span className="uppercase tracking-wider">
              confiança {CONFIDENCE[action.confidence]}
            </span>
            <span className="uppercase tracking-wider">
              {action.reversible ? "reversível" : "irreversível"}
            </span>
          </p>

          {/*
            Editing re-projects the outcome in place. `D-frontend.md` asks for that visibly,
            and it is the interaction that makes Mazal read as a colleague rather than a
            dashboard — you change the assumption, the number under it moves.
          */}
          {editing && (
            <label className="mt-2 flex items-center gap-3 border-t border-rule pt-2 font-struck text-[11px] uppercase tracking-wider text-ink-soft">
              <span className="shrink-0">projetar para</span>
              <input
                type="range"
                min={from}
                max={Math.max(action.expectedEffect.to * 1.6, from * 1.1 + 0.001)}
                step={(Math.max(action.expectedEffect.to * 1.6, from) - from) / 40 || 0.001}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-1 w-full max-w-56 cursor-pointer appearance-none rounded-none bg-rule accent-stamp"
                aria-label={`Efeito projetado em ${metricLabel(metric)} para ${action.title}`}
              />
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

/** Advice. No box, no control — and the empty gutter where the box would be says why. */
function SellerRow({ action }: { action: Action }) {
  const { metric, from, to } = action.expectedEffect;
  return (
    <li className="flex gap-3 py-3 sm:gap-4">
      <span className="mt-1 size-[1.1rem] shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-form text-[1.05rem] font-semibold leading-tight text-ink">
          {action.title}
        </p>
        <p className="mt-0.5 max-w-[64ch] text-[13px] leading-snug text-ink-soft">
          {action.change}
        </p>
        <p className="mt-1.5 font-struck text-[11px] text-ink-soft">
          {metricLabel(metric)} {formatMetric(metric, from)} → {formatMetric(metric, to)} ·{" "}
          <span className="uppercase tracking-wider">confiança {CONFIDENCE[action.confidence]}</span>
        </p>
      </div>
    </li>
  );
}

/**
 * The receipt, torn off at the perforation. `/api/execute` appends to a log and returns this
 * string; there is no Meta API client behind it, and the sheet says so where a fiscal document
 * would carry its authorisation.
 */
function Protocolo({ receipt, count }: { receipt: string; count: number }) {
  return (
    <div className="px-5 sm:px-8">
      <Perforation label="destaque e guarde" />
      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            protocolo
          </p>
          <p className="mt-1 font-struck text-sm text-ink">{receipt}</p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {count} {count === 1 ? "ação registrada" : "ações registradas"} no log.
          </p>
        </div>
        <div className="max-w-[36ch]">
          <Stamp tone="seal" className="text-[10px]">
            nada foi escrito na conta
          </Stamp>
          <p className="mt-2 text-[12px] leading-snug text-ink-soft">
            As escritas são simuladas nesta build. O plano foi anexado ao log e nenhuma
            alteração chegou ao Meta ou à loja.
          </p>
        </div>
      </div>
    </div>
  );
}

const CONFIDENCE = { low: "baixa", medium: "média", high: "alta" } as const;

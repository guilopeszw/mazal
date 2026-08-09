import type { Diagnosis, ReferenceMode } from "@mazal/contracts";
import { formatDate, formatDeviation, formatMetric, metricLabel } from "@/lib/format";
import { verdictStamp } from "@/lib/verdict";

/**
 * The chat sidebar, in the document's own grammar.
 *
 * A Brazilian administrative document does not have a chat; it has a *despacho* — the analyst's
 * running note struck down the margin, each entry stamped with its hour. That is the same
 * object a chat sidebar is, minus the bubbles, and it gives the narration somewhere to live
 * that belongs to the sheet instead of floating beside it.
 *
 * `POST /api/chat` is E's and does not exist yet, so this is the shell the brief asks for. The
 * three lines below are *composed from the diagnosis*, not written by a model and not invented:
 * every value in them is a contract field, so the shell can never assert something the sheet
 * does not already show. When E's route lands it replaces the body of this list.
 *
 * Verdict first, evidence second, plan third — never the reverse. Short sentences: a long
 * response reads as a language model, three sharp ones read as expertise.
 */
export function Despacho({
  diagnosis,
  reference,
  actionCount,
}: {
  diagnosis: Diagnosis;
  reference: ReferenceMode;
  actionCount: number;
}) {
  const notes = composeNotes(diagnosis, reference, actionCount);

  return (
    <aside className="w-full lg:sticky lg:top-10 lg:w-[19rem] lg:shrink-0">
      <div className="border-t-2 border-rule-strong bg-paper/60 px-4 py-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft">
          despacho
        </h2>

        <ol className="mt-3 space-y-3">
          {notes.map((note, i) => (
            <li key={note} className="grid grid-cols-[2.6rem_minmax(0,1fr)] gap-x-2">
              <span className="font-struck text-[10px] leading-5 text-ghost tabular-nums">
                {String(9 + i).padStart(2, "0")}:4{i}
              </span>
              <p className="text-[13px] leading-snug text-ink">{note}</p>
            </li>
          ))}
        </ol>

        <form
          className="mt-4 border-t border-rule pt-3"
          aria-label="Perguntar ao Mazal"
          onSubmit={undefined}
        >
          <label
            htmlFor="despacho-input"
            className="block text-[10px] uppercase tracking-[0.14em] text-ink-soft"
          >
            perguntar
          </label>
          <input
            id="despacho-input"
            name="pergunta"
            disabled
            placeholder="aguardando o canal do agente"
            className="mt-1 w-full border-0 border-b border-rule bg-transparent pb-1 font-struck text-[12px] text-ink placeholder:text-ghost focus:border-ink focus:outline-none disabled:cursor-not-allowed"
          />
          <p className="mt-2 text-[11px] leading-snug text-ink-soft">
            O canal de conversa é <span className="font-struck">POST /api/chat</span> e ainda não
            está no ar. As notas acima são compostas do próprio parecer.
          </p>
        </form>
      </div>
    </aside>
  );
}

function composeNotes(
  diagnosis: Diagnosis,
  reference: ReferenceMode,
  actionCount: number,
): string[] {
  const { primary, changePoint } = diagnosis;
  if (!primary) {
    return [
      "Nenhum estágio desviou o suficiente da referência.",
      "Não há vazamento para apontar nesta janela.",
      "Não proponho nada. A campanha está de pé.",
    ];
  }

  const verdict = verdictStamp(diagnosis, reference);
  const notes = [`${verdict.text[0]!.toUpperCase()}${verdict.text.slice(1)}. ${verdict.note}`];

  notes.push(
    `${metricLabel(primary.metric)} está em ${formatMetric(primary.metric, primary.observed)} contra ${formatMetric(
      primary.metric,
      primary.reference,
    )} de referência — ${formatDeviation(primary.deviation)}.` +
      (primary.evidence
        ? ` No dia ${formatDate(primary.evidence.date)}: ${primary.evidence.detail}.`
        : changePoint
          ? ` A ruptura foi em ${formatDate(changePoint.date)}.`
          : ""),
  );

  notes.push(
    `Proponho ${actionCount} ${actionCount === 1 ? "ação" : "ações"}. Você marca o que entra antes de qualquer coisa rodar.`,
  );

  return notes;
}

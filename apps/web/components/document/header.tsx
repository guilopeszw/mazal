import type { Diagnosis, ReferenceMode } from "@mazal/contracts";
import { Barcode } from "./barcode";
import { Stamp } from "./stamp";
import { formatDate } from "@/lib/format";
import { documentNumber, groupDocumentNumber, verdictStamp } from "@/lib/verdict";

/**
 * The emitter block. On a Brazilian transactional document this is the top-left corner and it
 * is always the same three things stacked: who issued it, what it is, and the machine-readable
 * copy of its number. Everything identifying sits on the left; everything about *this* copy of
 * the document sits on the right.
 *
 * The verdict is struck across the right side, rotated, overlapping the rule. A stamp that
 * respected the box would not be a stamp.
 */
export function DocumentHeader({
  diagnosis,
  reference,
  campaignId,
  lastDate,
  moment,
}: {
  diagnosis: Diagnosis;
  reference: ReferenceMode;
  campaignId: string;
  lastDate: string;
  moment: string;
}) {
  const number = documentNumber(campaignId, lastDate);
  const verdict = verdictStamp(diagnosis, reference);

  return (
    <header className="grid gap-6 px-5 pb-6 pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-8 sm:pt-8">
      <div>
        <p className="font-form text-[2.75rem] font-extrabold leading-[0.85] tracking-[-0.045em] sm:text-6xl">
          Mazal
        </p>
        <p className="mt-2 max-w-[34ch] text-sm leading-snug text-ink-soft">
          Parecer de subscrição de campanha. Campanhas não deveriam depender de sorte.
        </p>
        <Barcode payload={number} className="mt-5 block text-ink" height={32} />
        <p className="mt-1 font-struck text-[11px] tracking-[0.22em] text-ink-soft">
          {groupDocumentNumber(number)}
        </p>
      </div>

      <div className="relative flex flex-col items-start gap-4 sm:items-end sm:text-right">
        <dl className="font-struck text-[11px] leading-relaxed text-ink-soft">
          <div className="flex gap-2 sm:justify-end">
            <dt className="uppercase tracking-wider">Emissão</dt>
            <dd className="text-ink">{formatDate(lastDate)} de 2026</dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt className="uppercase tracking-wider">Campanha</dt>
            <dd className="text-ink">{campaignId}</dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt className="uppercase tracking-wider">Via</dt>
            <dd className="text-ink">cliente</dd>
          </div>
        </dl>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Stamp tone="verdict" className="text-base sm:text-xl">
            {verdict.text}
          </Stamp>
          <Stamp tone="seal" className="text-[10px]">
            sem valor fiscal
          </Stamp>
        </div>
      </div>

      <p className="max-w-[62ch] border-l-0 text-[0.95rem] leading-relaxed text-ink sm:col-span-2">
        <span className="text-ghost">{moment}</span> {verdict.note}
      </p>
    </header>
  );
}

import type { Diagnosis, ReferenceMode, Verdict } from "@mazal/contracts";
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
  verdict: engineVerdict,
  campaignId,
  lastDate,
  moment,
}: {
  diagnosis: Diagnosis;
  reference: ReferenceMode;
  verdict: Verdict;
  campaignId: string;
  lastDate: string;
  moment: string;
}) {
  const number = documentNumber(campaignId, lastDate);
  const verdict = verdictStamp(diagnosis, reference, engineVerdict);

  return (
    <header className="grid gap-6 px-5 pb-6 pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-8 sm:pt-8">
      {/*
        The emitter block, and it is deliberately not the largest thing here. The funnel is the
        object this product is recognised by; a masthead that outweighs it turns the first
        viewport into a brand slide. The wordmark identifies the issuer, which is all a document
        header is for.
      */}
      <div>
        <p className="font-form text-2xl font-extrabold leading-none tracking-[-0.03em] sm:text-[1.75rem]">
          Mazal
        </p>
        <p className="mt-1.5 max-w-[38ch] text-[13px] leading-snug text-ink-soft">
          Parecer de subscrição de campanha. Campanhas não deveriam depender de sorte.
        </p>
        <Barcode payload={number} className="mt-3.5 block text-ink" height={26} />
        <p className="mt-1 font-struck text-[10px] tracking-[0.22em] text-ink-soft">
          {groupDocumentNumber(number)}
        </p>
      </div>

      {/*
        The stamp overprints paper and the header's own rule, never a field value. Struck at
        -7° it lifts its right end by roughly half its width times sin 7 — about sixteen pixels
        — and at the previous clearance that end landed across "VIA cliente" and cancelled it.
        Overprinting is true to the world; making a value unreadable is a bug wearing the
        world's clothes.
      */}
      <div className="relative flex flex-col items-start gap-7 sm:items-end sm:text-right">
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

        <div className="flex flex-col items-start gap-2 sm:mr-1 sm:items-end">
          <Stamp tone="verdict" impression="a" strike className="text-base sm:text-xl">
            {verdict.text}
          </Stamp>
        </div>
      </div>

      <p className="max-w-[62ch] text-[0.95rem] leading-relaxed text-ink sm:col-span-2">
        <span className="text-ghost">{moment}</span> {verdict.note}
      </p>
    </header>
  );
}

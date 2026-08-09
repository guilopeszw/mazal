import type { Diagnosis, ReferenceMode } from "@mazal/contracts";

/**
 * What gets stamped across the header.
 *
 * The stamp is the one thing legible from the back of the room, so it has to be the sentence
 * the seller most needs and cannot be a restatement of the metric. `demo-script.md` is explicit
 * that Mazal never says "your ROAS is low" — a sentence with no information in it — so the
 * stamp names the *decision*, and the decision is a function of which side of the media
 * dividing line the leak fell on.
 *
 * Derived from the diagnosis, never authored per case: a stamp that disagreed with the funnel
 * beneath it would discredit every number on the sheet.
 */
export function verdictStamp(
  diagnosis: Diagnosis,
  reference: ReferenceMode,
): { text: string; note: string } {
  if (diagnosis.primary === null) {
    return {
      text: "sem vazamento",
      note: "Nenhum estágio desviou o suficiente da referência para ser sinalizado.",
    };
  }

  if (diagnosis.primary.causeLayer === "media") {
    return {
      text: "ajuste a mídia",
      note: "O vazamento está acima da linha: é entrega ou atenção, e é onde o Ads Manager alcança.",
    };
  }

  // Pre-flight: the campaign has not run, so the decision is whether to spend at all.
  if (reference.kind === "benchmark") {
    return {
      text: "não lance",
      note: "O vazamento está abaixo da linha. Lançar assim gasta mídia num funil que já vaza.",
    };
  }

  // In-flight: the money is already moving, and the instruction is to leave the ads alone.
  return {
    text: "não é o anúncio",
    note: "As pessoas continuam clicando. Não mexa na campanha — o vazamento está depois do clique.",
  };
}

/**
 * A document number that is honest about what it is: our number for this opinion, not a
 * fiscal one. Date of issue, then four digits derived from the campaign id, so the same case
 * always prints the same number and two campaigns on the same day cannot collide.
 *
 * Derived rather than read, because a campaign id is free text — `mazal-demo-furniture` has
 * no digits in it at all, and slicing for them yields `0000` for every campaign that happens
 * to be named rather than numbered.
 *
 * Digits only: the barcode beneath it is Interleaved 2 of 5, which is a numeric symbology.
 */
export function documentNumber(campaignId: string, lastDate: string): string {
  let acc = 7;
  for (const char of campaignId) acc = (acc * 31 + char.charCodeAt(0)) % 10000;
  return `${lastDate.replace(/-/g, "")}${String(acc).padStart(4, "0")}`;
}

/** "2026 0730 0412" — grouped so a human can read it back over the phone. */
export const groupDocumentNumber = (n: string) =>
  n.replace(/(\d{4})(?=\d)/g, "$1 ").trim();

import type { ResolvedContext } from "./context.ts";
import { noPixelEvidence } from "@mazal/engine";

import { renderNarration, type StructuredNarration } from "./narration.ts";

function templateForPrimary(context: ResolvedContext): StructuredNarration {
  // `primary: null` means two opposite things. This is the one where there was
  // nothing to look at: no pixel on the checkout, so Meta reported no
  // conversion of any kind and the engine judged none of stages 3-6. Telling
  // this seller nothing broke is the same lie the sheet used to tell.
  if (!context.diagnosis.primary && noPixelEvidence(context.input.days, context.input.events)) {
    return {
      verdict: "Seus anúncios rodaram. O que acontece depois do clique, não conseguimos ver.",
      evidence:
        "A Meta não registrou nenhum carrinho, checkout ou compra em nenhum dia deste período. Isso é o que aparece quando a venda acontece onde o pixel não alcança: iFood, WhatsApp, um marketplace.",
      plan: "Não dá para dizer que está tudo bem com o que não foi medido. Pergunte sobre um lançamento: essa conta precisa do produto, não do pixel.",
    };
  }

  if (!context.diagnosis.primary) {
    return {
      verdict: "Não há um vazamento confirmado nesta leitura.",
      evidence: "Os dados atuais não apontam uma quebra mensurável do funil.",
      plan: "Mantenha a campanha sob observação antes de mudar o investimento.",
    };
  }

  return {
    verdict: "O vazamento começa no estágio {{diagnosis.primary.stage|integer}}.",
    evidence: "A taxa observada é {{diagnosis.primary.observed|percent}}, abaixo da referência de {{diagnosis.primary.reference|percent}}.",
    plan: context.plan.actions[0]
      ? "Priorize {{plan.firstAction.title|text}}."
      : "Revise a oferta antes de escalar a campanha.",
  };
}

export function templateFor(context: ResolvedContext): string {
  return renderNarration(templateForPrimary(context), context);
}

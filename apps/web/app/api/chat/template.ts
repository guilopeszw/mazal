import type { ResolvedContext } from "./context.ts";
import { renderNarration, type StructuredNarration } from "./narration.ts";

function templateForPrimary(context: ResolvedContext): StructuredNarration {
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

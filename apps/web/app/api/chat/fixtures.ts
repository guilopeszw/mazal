import type { ResolvedContext } from "./context.ts";
import { renderNarration, type StructuredNarration } from "./narration.ts";
import { templateFor } from "./template.ts";

const fixtures: Record<"case1" | "case2", StructuredNarration> = {
  case1: {
    verdict: "O vazamento começa no estágio {{diagnosis.primary.stage|integer}}.",
    evidence: "A taxa observada é {{diagnosis.primary.observed|percent}}, abaixo da referência de {{diagnosis.primary.reference|percent}}.",
    plan: "Priorize {{plan.firstAction.title|text}}.",
  },
  case2: {
    verdict: "O vazamento começa no estágio {{diagnosis.primary.stage|integer}}.",
    evidence: "A taxa observada é {{diagnosis.primary.observed|percent}}, abaixo da referência de {{diagnosis.primary.reference|percent}}.",
    plan: "Priorize {{plan.firstAction.title|text}}.",
  },
};

export function fixtureFor(scenarioKey: "case1" | "case2", context: ResolvedContext): string {
  if (!context.diagnosis.primary || !context.plan.actions[0]) {
    return templateFor(context);
  }
  return renderNarration(fixtures[scenarioKey], context);
}

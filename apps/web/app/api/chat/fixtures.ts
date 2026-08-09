import type { ResolvedContext } from "./context.ts";
import { renderNarration, type StructuredNarration } from "./narration.ts";

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
  return renderNarration(fixtures[scenarioKey], context);
}

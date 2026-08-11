import type { ResolvedContext } from "./context.ts";
import { renderNarration, type StructuredNarration } from "./narration.ts";
import { planTitlePt } from "./plan-pt.ts";
import { templateFor } from "./template.ts";

const fixtures: Record<"case1" | "case2", StructuredNarration> = {
  case1: {
    verdict: "O vazamento começa no estágio {{diagnosis.primary.stage|integer}}.",
    evidence: "A taxa observada é {{diagnosis.primary.observed|percent}}, abaixo da referência de {{diagnosis.primary.reference|percent}}.",
    plan: "Priorize {{plan.firstAction.titlePt|text}}.",
  },
  case2: {
    verdict: "O vazamento começa no estágio {{diagnosis.primary.stage|integer}}.",
    evidence: "A taxa observada é {{diagnosis.primary.observed|percent}}, abaixo da referência de {{diagnosis.primary.reference|percent}}.",
    plan: "Priorize {{plan.firstAction.titlePt|text}}.",
  },
};

export function fixtureFor(scenarioKey: "case1" | "case2", context: ResolvedContext): string {
  /**
   * The last condition is not cosmetic. These fixtures interpolate
   * `titlePt` unconditionally, and an action with no translation makes
   * `renderSection` throw — which `route.ts` catches as a 400, discarding a
   * verdict and an evidence line that had both resolved perfectly well and
   * blaming the caller for a request that was fine. `narrationMode()` defaults
   * to `fixture`, so that is the default path, not an edge of one.
   *
   * Falling through to the template instead costs the seller the specific
   * action and keeps the answer.
   */
  if (
    !context.diagnosis.primary ||
    !context.plan.actions[0] ||
    !planTitlePt(context.plan.actions[0].id)
  ) {
    return templateFor(context);
  }
  return renderNarration(fixtures[scenarioKey], context);
}

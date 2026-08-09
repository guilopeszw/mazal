import type { CauseLayer, FunnelStage } from "@mazal/contracts";

/**
 * The seven stages, ordered. Names and cause layers come from the table in
 * `docs/plan/A-engine.md` — the engine decides which stage broke, and this only decides
 * what that stage is called on screen.
 */
export const FUNNEL_STAGES: ReadonlyArray<{
  stage: FunnelStage;
  label: string;
  causeLayer: CauseLayer;
  metrics: string;
}> = [
  { stage: 0, label: "Entrega", causeLayer: "media", metrics: "impressões · CPM · frequência" },
  { stage: 1, label: "Atenção", causeLayer: "media", metrics: "CTR · CPC" },
  { stage: 2, label: "Chegada", causeLayer: "experience", metrics: "sessões · rejeição" },
  { stage: 3, label: "Interesse no produto", causeLayer: "product", metrics: "add-to-cart · custo por ATC" },
  { stage: 4, label: "Intenção", causeLayer: "experience", metrics: "checkouts iniciados" },
  { stage: 5, label: "Compra", causeLayer: "experience", metrics: "conversão · CPA" },
  { stage: 6, label: "Economia", causeLayer: "offer", metrics: "ticket médio · ROAS" },
];

/**
 * The dividing line sits between stage 2 and stage 3. Stages 0–2 are a media problem;
 * stages 3–6 are a product, offer, or experience problem. That line is the thesis, so it
 * is a named constant rather than a hardcoded `index === 3` somewhere in the markup.
 */
export const MEDIA_PRODUCT_BOUNDARY: FunnelStage = 3;

export type StageTone = "upstream" | "leak" | "downstream";

/**
 * Upstream of the leak is healthy, the leak is the leak, and everything downstream is a
 * symptom. Colouring a downstream stage red is the exact misdiagnosis Mazal exists to
 * prevent, so the decision lives in one function instead of in each component that draws.
 *
 * A healthy campaign — `primary: null`, which is a real answer — has no leak, and every
 * stage reads as upstream.
 */
export function toneFor(stage: FunnelStage, leak: FunnelStage | null): StageTone {
  if (leak === null || stage < leak) return "upstream";
  if (stage === leak) return "leak";
  return "downstream";
}

import type { CampaignDay, CauseLayer, FunnelStage } from "@mazal/contracts";
import { atcRate, cpm, ctr, cvr, icRate, roas } from "@mazal/contracts/metrics";

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
  /**
   * Why a stage carries no verdict, when it carries none. A row with a blank status sitting
   * upstream of the leak, under a title claiming "first stage that deviated", is a hole in the
   * argument exactly where it is least affordable — the reader is entitled to ask what the
   * engine did about the stage it skipped, and the answer is printed rather than implied.
   */
  unassessed?: string;
}> = [
  { stage: 0, label: "Entrega", causeLayer: "media", metrics: "impressões · CPM · frequência" },
  { stage: 1, label: "Atenção", causeLayer: "media", metrics: "CTR · CPC" },
  {
    stage: 2,
    label: "Chegada",
    causeLayer: "experience",
    metrics: "sessões · rejeição",
    unassessed:
      "A loja não envia sessões nem rejeição, então o estágio não foi avaliado — nem aprovado, nem acusado.",
  },
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

/**
 * The one headline number per stage, so the funnel reads as a cascade rather than as a list of
 * metric names. A row that names `add-to-cart · custo por ATC` and shows nothing makes the
 * product's identity object the only block on the sheet with nothing auditable in it.
 *
 * One rate per stage, in the funnel's own order, so the drop between a healthy 2,1% and a
 * broken 0,6% is a quantity the room can see from the back — not a colour it has to decode.
 *
 * Every one of these is a function imported from the contract. Frequency belongs to stage 0 and
 * is deliberately absent: the contract stores `reach` so frequency is *derivable*, but it
 * exports no function for it, and deriving it here would be the `clicks / impressions` the
 * rules exist to prevent. CPM carries the stage instead.
 */
const STAGE_METRIC: Partial<Record<FunnelStage, { metric: string; of: (d: CampaignDay) => number }>> =
  {
    0: { metric: "cpm", of: cpm },
    1: { metric: "ctr", of: ctr },
    // Stage 2 needs `sessions` and `bounceRate`, which are optional in the contract and absent
    // for a seller without analytics. The engine skips the stage; so does the sheet.
    3: { metric: "atcRate", of: atcRate },
    4: { metric: "icRate", of: icRate },
    5: { metric: "cvr", of: cvr },
    6: { metric: "roas", of: roas },
  };

export function stageValue(
  stage: FunnelStage,
  flight: CampaignDay,
): { metric: string; value: number } | null {
  const entry = STAGE_METRIC[stage];
  if (!entry) return null;
  return { metric: entry.metric, value: entry.of(flight) };
}

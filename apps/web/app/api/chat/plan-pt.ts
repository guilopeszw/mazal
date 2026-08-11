/**
 * The engine writes `Action.title` in English — `packages/engine/src/plan.ts`,
 * and it is A's package. The chat route answers in Portuguese, and interpolating
 * the title raw produced "Priorize Show the delivery estimate on the product
 * page." on the public URL: a Portuguese sentence with an English clause inside
 * it, on the one screen a Brazilian seller reads.
 *
 * Keyed on the action's id (`${cause}.${index}`), which is stable, rather than
 * on the English string, which is prose and will be edited. An id with no entry
 * here yields nothing, and the caller drops the sentence rather than printing
 * English — a missing translation should read as silence, never as the original.
 */
export const PLAN_TITLE_PT: Record<string, string> = {
  "stockout.0": "pausar a campanha até o estoque voltar",
  "stockout.1": "esconder a variação que está sem estoque",

  "eta_shock.0": "mostrar o prazo de entrega na página do produto",
  "eta_shock.1": "oferecer frete grátis acima de um valor",
  "eta_shock.2": "pausar a campanha até o prazo normalizar",

  "creative_fatigue.0": "trocar a criação do anúncio",
  "creative_fatigue.1": "limitar quantas vezes a mesma pessoa vê o anúncio",

  "price_too_high.0": "testar um preço mais baixo",
  "price_too_high.1": "montar um combo em vez de dar desconto",

  "checkout_friction.0": "fazer uma compra de teste do início ao fim",
  "checkout_friction.1": "adicionar uma forma de pagamento",

  "pixel_break.0": "conferir o rastreamento antes de gastar mais",
  "pixel_break.1": "pausar o investimento até confirmar o rastreamento",

  "budget_cap.0": "aumentar o orçamento, ou aceitar menos volume",

  "thin_pdp.0": "adicionar fotos do produto",
  "thin_pdp.1": "detalhar melhor a descrição",
};

/** The action's title in Portuguese, or nothing if it has no translation yet. */
export function planTitlePt(id: string | undefined): string | undefined {
  return id ? PLAN_TITLE_PT[id] : undefined;
}

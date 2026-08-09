/**
 * Display only. Nothing here computes a rate — `@mazal/contracts/metrics` does that, and a
 * second definition of CTR living in the UI is how the screen ends up disagreeing with the
 * engine in front of a judge. These functions take a number the contract already carries
 * and decide how it reads in pt-BR.
 */

const pct = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("pt-BR");

type Shape = "rate" | "money" | "ratio" | "count";

/** How each contract metric reads, and what the seller calls it. */
const METRICS: Record<string, { label: string; shape: Shape; denominator: string }> = {
  cpm: { label: "CPM", shape: "money", denominator: "impressões" },
  cpc: { label: "Custo por clique", shape: "money", denominator: "cliques" },
  ctr: { label: "Taxa de clique", shape: "rate", denominator: "impressões" },
  frequency: { label: "Frequência", shape: "ratio", denominator: "impressões" },
  atcRate: { label: "Taxa de add-to-cart", shape: "rate", denominator: "cliques" },
  costPerAtc: { label: "Custo por add-to-cart", shape: "money", denominator: "add-to-carts" },
  icRate: { label: "Taxa de checkout iniciado", shape: "rate", denominator: "add-to-carts" },
  cvr: { label: "Taxa de conversão", shape: "rate", denominator: "cliques" },
  cpa: { label: "Custo por venda", shape: "money", denominator: "vendas" },
  aov: { label: "Ticket médio", shape: "money", denominator: "vendas" },
  roas: { label: "ROAS", shape: "ratio", denominator: "reais gastos" },
  price: { label: "Preço", shape: "money", denominator: "itens" },
  freightRatio: { label: "Frete sobre o preço", shape: "rate", denominator: "itens" },
  deliveryDays: { label: "Prazo de entrega", shape: "count", denominator: "pedidos" },
  reviewAvg: { label: "Nota média", shape: "count", denominator: "avaliações" },
  photos: { label: "Fotos no anúncio", shape: "count", denominator: "produtos" },
  descriptionLength: { label: "Tamanho da descrição", shape: "count", denominator: "produtos" },
};

export const metricLabel = (metric: string) => METRICS[metric]?.label ?? metric;

/** What `Finding.sampleSize` counts — "412 cliques", not a bare 412. */
export const denominatorOf = (metric: string) => METRICS[metric]?.denominator ?? "amostras";

export function formatMetric(metric: string, value: number): string {
  switch (METRICS[metric]?.shape) {
    case "money":
      return brl.format(value);
    case "rate":
      return pct.format(value);
    case "ratio":
      return num.format(value);
    case "count":
      return num.format(value);
    default:
      return num.format(value);
  }
}

export const formatCount = (value: number) => int.format(value);

/** "12 de julho" — the change point and the evidence both need a date a seller reads. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Store events are typed in the contract; the seller should not read `eta_change`. */
export const EVENT_LABELS: Record<string, string> = {
  stockout: "ruptura de estoque",
  price_change: "mudança de preço",
  eta_change: "mudança no prazo de entrega",
  creative_refresh: "troca de criativo",
  budget_change: "mudança de orçamento",
  pixel_error: "erro no pixel",
  policy_flag: "sinalização de política",
};

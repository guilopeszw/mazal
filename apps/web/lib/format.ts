/**
 * Display only. Nothing here computes a rate — `@mazal/contracts/metrics` does that, and a
 * second definition of CTR living in the UI is how the screen ends up disagreeing with the
 * engine in front of a judge. These functions take a number the contract already carries
 * and decide how it reads on screen.
 *
 * Locale is `en` to match the interface copy; currency stays BRL because the money is real
 * even when the words are not Portuguese.
 */

const pct = new Intl.NumberFormat("en", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const brl = new Intl.NumberFormat("en", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en");

type Shape = "rate" | "money" | "ratio" | "count";

/** How each contract metric reads, and what the seller calls it. */
const METRICS: Record<string, { label: string; short: string; shape: Shape; denominator: string }> = {
  cpm: { label: "CPM", short: "CPM", shape: "money", denominator: "impressions" },
  cpc: { label: "Cost per click", short: "CPC", shape: "money", denominator: "clicks" },
  ctr: { label: "Click-through rate", short: "CTR", shape: "rate", denominator: "impressions" },
  atcRate: { label: "Add-to-cart rate", short: "ATC", shape: "rate", denominator: "clicks" },
  costPerAtc: { label: "Cost per add-to-cart", short: "CPATC", shape: "money", denominator: "add-to-carts" },
  icRate: { label: "Checkouts per add-to-cart", short: "IC", shape: "rate", denominator: "add-to-carts" },
  cvr: { label: "Conversion rate", short: "CVR", shape: "rate", denominator: "clicks" },
  cpa: { label: "Cost per sale", short: "CPA", shape: "money", denominator: "sales" },
  aov: { label: "Average order value", short: "AOV", shape: "money", denominator: "sales" },
  roas: { label: "ROAS", short: "ROAS", shape: "ratio", denominator: "reais spent" },
  price: { label: "Price", short: "price", shape: "money", denominator: "items" },
  freightRatio: { label: "Freight over price", short: "freight", shape: "rate", denominator: "items" },
  deliveryDays: { label: "Delivery promise", short: "ETA", shape: "count", denominator: "orders" },
  reviewAvg: { label: "Average rating", short: "rating", shape: "count", denominator: "reviews" },
  photos: { label: "Photos on the listing", short: "photos", shape: "count", denominator: "products" },
  descriptionLength: { label: "Description length", short: "copy", shape: "count", denominator: "products" },
};

export const metricLabel = (metric: string) => METRICS[metric]?.label ?? metric;

/** "IC 14.3%" in a funnel row — the code a media buyer already reads. */
export const metricShort = (metric: string) => METRICS[metric]?.short ?? metric;

/** What `Finding.sampleSize` counts — "31 add-to-carts", not a bare 31. */
export const denominatorOf = (metric: string) => METRICS[metric]?.denominator ?? "samples";

export function formatMetric(metric: string, value: number): string {
  switch (METRICS[metric]?.shape) {
    case "money":
      return brl.format(value);
    case "rate":
      return pct.format(value);
    default:
      return num.format(value);
  }
}

export const formatCount = (value: number) => int.format(value);

/** Money that is not a metric — spend, revenue, a break-even. */
export const formatBRL = (value: number) => brl.format(value);

/** A stored fraction read as a percentage — a gross margin, never a funnel rate. */
export const formatPercent = (value: number) => pct.format(value);

/** "4.48×" — a ROAS band edge or a break-even. */
export const formatRoas = (value: number) => `${num.format(value)}×`;

/** "−5.7σ", with a real minus sign so it matches the typographic weight of the digits. */
export const formatDeviation = (value: number) =>
  `${new Intl.NumberFormat("en", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace("-", "−")}σ`;

/**
 * "11 July" — the change point and the evidence both need a date a seller reads.
 *
 * `timeZone: 'UTC'` is load-bearing, not tidiness. The contract stores dates as bare
 * `YYYY-MM-DD` with no zone; parsed as UTC midnight and then formatted in America/Sao_Paulo
 * they land at 21:00 the previous day, and the verdict announces the campaign broke on the
 * 11th while every number under it is the 12th's. Off by one, in the one sentence the demo
 * is built around.
 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Store events are typed in the contract; the seller should not read `eta_change`. */
export const EVENT_LABELS: Record<string, string> = {
  stockout: "stock-out",
  price_change: "price change",
  eta_change: "delivery-estimate change",
  creative_refresh: "creative refresh",
  budget_change: "budget change",
  pixel_error: "pixel error",
  policy_flag: "policy flag",
};

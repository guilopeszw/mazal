/**
 * Derives `benchmarks.json` and `categories.ts` from the raw Kaggle CSVs in `data/raw/`.
 *
 *   pnpm derive
 *
 * The raw files are gitignored and never enter the repo — Olist is CC BY-NC-SA.
 * What lands here is aggregate only: median, p25, p75 and n, per metric per category.
 * Run by hand, output committed, never hand-edited. See docs/plan/B-data.md.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAW = resolve(import.meta.dirname, '../../data/raw');
const OUT_JSON = join(import.meta.dirname, 'benchmarks.json');
// The union is generated into `packages/contracts`, not here: every package imports the
// contract, so the contract has to stay the leaf. Generated file, never hand-edited.
const OUT_CATEGORIES = resolve(import.meta.dirname, '../contracts/src/categories.ts');
const OUT_SELLERS = join(import.meta.dirname, 'seller-benchmarks.json');

/** Categories below this many orders have quartiles too noisy to show a seller. */
const MIN_ORDERS = 30;

/**
 * Peer gates. A "seller" here is a seller within one category, because the same
 * shop sells brooms and headphones and is a different competitor in each.
 *
 * Two gates because there are two questions. Placing a card against the
 * distribution needs enough sellers to have percentiles; saying what the top
 * quartile does differently needs enough to have quartiles. A category short of
 * either gets nothing for that question and says so — the same discipline as
 * `n: 0` on the media priors.
 */
const MIN_SELLER_SALES = 10;
const MIN_SELLER_REVIEWS = 5;
const MIN_SELLERS_FOR_PERCENTILES = 20;
const MIN_SELLERS_FOR_LEVERS = 30;

type Distribution = {
  median: number;
  p25: number;
  p75: number;
  n: number;
  source: 'olist' | 'kaggle_meta' | 'prior';
};

type BenchmarkMetric =
  | 'cpm' | 'ctr' | 'atcRate' | 'icRate' | 'cvr' | 'aov'
  | 'price' | 'freightRatio' | 'deliveryDays'
  | 'reviewAvg' | 'photos' | 'descriptionLength';

/**
 * Media priors — published Meta benchmarks for Brazilian retail, in BRL. Every one
 * of these is an estimate, and `n: 0` is how the UI knows to say so. Do not launder
 * an estimate as a measurement.
 *
 * They carry `source: 'prior'`. They shipped as `'kaggle_meta'` because the union had
 * nowhere honest to put a published estimate, which labelled five of twelve metrics as
 * coming from a dataset none of them came from.
 *
 * `atcRate` and `icRate` are here because the facebook-ad-campaign dataset has
 * impressions, clicks and conversions and nothing between them.
 *
 * `cpm`, `ctr` and `cvr` are here for a worse reason: that dataset measures 78.5M
 * impressions against 13,293 clicks, a 0.017% CTR at a CPM of 0.26 in an unstated
 * currency. Whatever it is, it is not Brazilian retail media in 2026, and a judge
 * who buys media would spot it in one glance. `derive.ts` prints what the dataset
 * actually says on every run, so the measured numbers and the reason we did not
 * ship them are both on the record.
 */
const MEDIA_PRIORS: Record<'cpm' | 'ctr' | 'cvr' | 'atcRate' | 'icRate', Distribution> = {
  cpm: { median: 22, p25: 14, p75: 34, n: 0, source: 'prior' },
  ctr: { median: 0.011, p25: 0.007, p75: 0.017, n: 0, source: 'prior' },
  cvr: { median: 0.021, p25: 0.012, p75: 0.034, n: 0, source: 'prior' },
  atcRate: { median: 0.08, p25: 0.045, p75: 0.12, n: 0, source: 'prior' },
  icRate: { median: 0.45, p25: 0.32, p75: 0.6, n: 0, source: 'prior' },
};

// ---------------------------------------------------------------- csv

/**
 * Parses RFC-4180-ish CSV: quoted fields, doubled quotes, commas and newlines
 * inside quotes. Olist's review comments contain all three.
 */
export function parseCsv(input: string): Record<string, string>[] {
  // product_category_name_translation.csv ships with a BOM. Left in, it hides
  // itself inside the first header name and every lookup on that column misses.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** CSVs in `data/raw/`, indexed by filename — an unzip puts them one directory down as often as not. */
const rawFiles = new Map<string, string>();
for (const entry of existsSync(RAW) ? readdirSync(RAW, { withFileTypes: true }) : []) {
  if (entry.isFile()) rawFiles.set(entry.name, join(RAW, entry.name));
  else if (entry.isDirectory()) {
    for (const nested of readdirSync(join(RAW, entry.name), { withFileTypes: true })) {
      if (nested.isFile() && !rawFiles.has(nested.name)) {
        rawFiles.set(nested.name, join(RAW, entry.name, nested.name));
      }
    }
  }
}

const csvCache = new Map<string, Record<string, string>[]>();

function readCsv(name: string): Record<string, string>[] {
  // Memoised: the seller pass needs products and the translation table that the
  // category pass already parsed, and re-reading 33,000 rows to get them back is
  // pure waste in a script that is slow enough by hand.
  const cached = csvCache.get(name);
  if (cached) return cached;

  const path = rawFiles.get(name);
  if (!path) {
    throw new Error(
      `Missing ${name} under ${RAW}\n\nDownload both datasets into data/raw/ (gitignored) — see docs/plan/B-data.md:\n` +
        `  kaggle datasets download -d olistbr/brazilian-ecommerce --unzip -p data/raw\n` +
        `  kaggle datasets download -d madislemsalu/facebook-ad-campaign --unzip -p data/raw`,
    );
  }
  const rows = parseCsv(readFileSync(path, 'utf8'));
  console.log(`  ${name.padEnd(44)} ${rows.length.toLocaleString('en-US').padStart(9)} rows`);
  csvCache.set(name, rows);
  return rows;
}

// ---------------------------------------------------------------- stats

/** Linear-interpolated quantile on a sorted array. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

/** Median of an unsorted array. */
function median(values: number[]): number {
  return quantile([...values].filter(Number.isFinite).sort((a, b) => a - b), 0.5);
}

export function distribution(values: number[], source: Distribution['source']): Distribution {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const round = (x: number) => Math.round(x * 1e4) / 1e4;
  return {
    median: round(quantile(sorted, 0.5)),
    p25: round(quantile(sorted, 0.25)),
    p75: round(quantile(sorted, 0.75)),
    n: sorted.length,
    source,
  };
}

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function push(map: Map<string, number[]>, key: string, value: number): void {
  if (!Number.isFinite(value)) return;
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------- derive

/**
 * Per-seller statistics, so a card can be placed against the sellers it competes
 * with rather than against the average order.
 *
 * The outcome is mean review score. It is the only quality signal Olist carries
 * per seller, and it is a proxy — nobody has competitors' campaign numbers, and
 * no product that claims to is telling the truth. Order volume was considered
 * and rejected: top-reviewed sellers have *fewer* orders in every category
 * measured, so ranking on volume would invert the question.
 *
 * A seller is scoped to one category. The same shop sells brooms and headphones
 * and is a different competitor in each.
 */
function deriveSellers(): void {
  const product = new Map<string, { category: string; photos: number; description: number }>();
  const translation = new Map(
    readCsv('product_category_name_translation.csv').map((r) => [
      r['product_category_name'] ?? '',
      r['product_category_name_english'] ?? '',
    ]),
  );
  for (const p of readCsv('olist_products_dataset.csv')) {
    const category = translation.get(p['product_category_name'] ?? '');
    const id = p['product_id'];
    if (!category || !id) continue;
    product.set(id, {
      category,
      photos: num(p['product_photos_qty']),
      description: num(p['product_description_lenght']),
    });
  }

  const reviewOf = new Map<string, number>();
  for (const r of readCsv('olist_order_reviews_dataset.csv')) {
    const score = num(r['review_score']);
    if (r['order_id'] && Number.isFinite(score)) reviewOf.set(r['order_id'], score);
  }

  const etaOf = new Map<string, number>();
  for (const o of readCsv('olist_orders_dataset.csv')) {
    const purchased = Date.parse(o['order_purchase_timestamp'] ?? '');
    const estimated = Date.parse(o['order_estimated_delivery_date'] ?? '');
    if (o['order_id'] && Number.isFinite(purchased) && Number.isFinite(estimated)) {
      etaOf.set(o['order_id'], (estimated - purchased) / 86_400_000);
    }
  }

  type Acc = Record<'price' | 'freightRatio' | 'deliveryDays' | 'photos' | 'descriptionLength' | 'reviewAvg', number[]>;
  const empty = (): Acc =>
    ({ price: [], freightRatio: [], deliveryDays: [], photos: [], descriptionLength: [], reviewAvg: [] });
  const sellers = new Map<string, Acc>();

  for (const item of readCsv('olist_order_items_dataset.csv')) {
    const p = product.get(item['product_id'] ?? '');
    const sellerId = item['seller_id'];
    const orderId = item['order_id'] ?? '';
    const price = num(item['price']);
    if (!p || !sellerId || !Number.isFinite(price)) continue;

    const key = `${p.category}|${sellerId}`;
    let acc = sellers.get(key);
    if (!acc) { acc = empty(); sellers.set(key, acc); }

    acc.price.push(price);
    if (price > 0) acc.freightRatio.push(num(item['freight_value']) / price);
    if (Number.isFinite(p.photos)) acc.photos.push(p.photos);
    if (Number.isFinite(p.description)) acc.descriptionLength.push(p.description);
    const eta = etaOf.get(orderId);
    if (eta !== undefined) acc.deliveryDays.push(eta);
    const review = reviewOf.get(orderId);
    if (review !== undefined) acc.reviewAvg.push(review);
  }

  const LEVERS = ['price', 'freightRatio', 'deliveryDays', 'photos', 'descriptionLength'] as const;
  const mean = (xs: number[]) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
  const round = (x: number) => Math.round(x * 1e4) / 1e4;

  /** One row per qualifying seller: their levers, and the outcome they achieved. */
  const byCategory = new Map<string, { levers: Record<string, number>; outcome: number }[]>();
  for (const [key, acc] of sellers) {
    if (acc.price.length < MIN_SELLER_SALES || acc.reviewAvg.length < MIN_SELLER_REVIEWS) continue;
    const category = key.slice(0, key.indexOf('|'));
    const row = {
      levers: Object.fromEntries(LEVERS.map((l) => [l, l === 'price' ? median(acc[l]) : mean(acc[l])])),
      outcome: mean(acc.reviewAvg),
    };
    const list = byCategory.get(category);
    if (list) list.push(row);
    else byCategory.set(category, [row]);
  }

  const table: Record<string, unknown> = {};
  for (const [category, rows] of [...byCategory.entries()].sort()) {
    if (rows.length < MIN_SELLERS_FOR_PERCENTILES) continue;

    const percentiles = Object.fromEntries(LEVERS.map((l) => {
      const values = rows.map((r) => r.levers[l]!).filter(Number.isFinite).sort((a, b) => a - b);
      return [l, {
        p25: round(quantile(values, 0.25)),
        median: round(quantile(values, 0.5)),
        p75: round(quantile(values, 0.75)),
        n: values.length,
      }];
    }));

    // Quartiles by outcome, best first. Sorted once and read three times.
    const ranked = [...rows].sort((a, b) => b.outcome - a.outcome);
    const q = Math.max(Math.floor(ranked.length / 4), 1);
    const top = ranked.slice(0, q);
    const bottom = ranked.slice(-q);

    // Levers only where a quartile is more than four shops.
    let levers = null;
    if (rows.length >= MIN_SELLERS_FOR_LEVERS) {
      levers = Object.fromEntries(LEVERS.map((l) => {
        const t = mean(top.map((r) => r.levers[l]!).filter(Number.isFinite));
        const b = mean(bottom.map((r) => r.levers[l]!).filter(Number.isFinite));
        return [l, { top: round(t), bottom: round(b), lift: b === 0 ? 0 : round((t - b) / Math.abs(b)) }];
      }));
    }

    table[category] = {
      category,
      sellers: rows.length,
      outcome: 'reviewAvg',
      outcomeTop: round(mean(top.map((r) => r.outcome))),
      outcomeBottom: round(mean(bottom.map((r) => r.outcome))),
      percentiles,
      levers,
    };
  }

  /**
   * How often each lever points the same way across every category that has
   * quartile data — computed here rather than written into the engine by hand.
   *
   * A hand-kept table of facts about the data becomes a lie the first time the
   * data is re-derived, and nothing would catch it. This is the same reason the
   * slide-6 numbers are checked against the file that produced them.
   */
  const withLeverData = Object.values(table)
    .map((c) => (c as { levers: Record<string, { lift: number }> | null }).levers)
    .filter((l): l is Record<string, { lift: number }> => l !== null);

  const replication = Object.fromEntries(LEVERS.map((l) => {
    const lifts = withLeverData.map((x) => x[l]!.lift).filter(Number.isFinite);
    const negative = lifts.filter((x) => x < 0).length;
    const agreeing = Math.max(negative, lifts.length - negative);
    const rate = lifts.length === 0 ? 0 : agreeing / lifts.length;
    return [l, {
      categories: lifts.length,
      agreeing,
      // Two thirds is the line: below it the lever is closer to a coin flip than
      // to a finding, and a percentile on it must not be quoted as predictive.
      evidence: rate >= 0.667 ? 'replicates' : 'inconsistent',
      medianLift: round(median(lifts)),
    }];
  }));

  writeFileSync(OUT_SELLERS, `${JSON.stringify({ replication, categories: table }, null, 2)}\n`);

  const withLevers = Object.values(table).filter((c) => (c as { levers: unknown }).levers !== null).length;
  console.log(
    `\n${Object.keys(table).length} categories with >=${MIN_SELLERS_FOR_PERCENTILES} qualifying sellers ` +
      `(>=${MIN_SELLER_SALES} sales, >=${MIN_SELLER_REVIEWS} reviews each), ` +
      `${withLevers} of them with >=${MIN_SELLERS_FOR_LEVERS} for quartile comparison.\n  ${OUT_SELLERS}`,
  );
}

function main(): void {
  console.log(`Reading ${RAW}`);

  const translation = new Map(
    readCsv('product_category_name_translation.csv').map((r) => [
      r['product_category_name'] ?? '',
      r['product_category_name_english'] ?? '',
    ]),
  );

  // product_id -> category, plus the two card metrics that live on the product row.
  const photos = new Map<string, number[]>();
  const descriptionLength = new Map<string, number[]>();
  const productCategory = new Map<string, string>();

  for (const p of readCsv('olist_products_dataset.csv')) {
    const category = translation.get(p['product_category_name'] ?? '');
    const id = p['product_id'];
    if (!category || !id) continue;
    productCategory.set(id, category);
    push(photos, category, num(p['product_photos_qty']));
    // The column name is misspelled in the source data. It stays misspelled.
    push(descriptionLength, category, num(p['product_description_lenght']));
  }

  const price = new Map<string, number[]>();
  const freightRatio = new Map<string, number[]>();
  const orderTotal = new Map<string, number>();
  const orderCategory = new Map<string, string>();

  for (const item of readCsv('olist_order_items_dataset.csv')) {
    const orderId = item['order_id'];
    const category = productCategory.get(item['product_id'] ?? '');
    const itemPrice = num(item['price']);
    const freight = num(item['freight_value']);
    if (!orderId || !category || !Number.isFinite(itemPrice)) continue;

    push(price, category, itemPrice);
    if (itemPrice > 0) push(freightRatio, category, freight / itemPrice);

    // An order's category is its first item's — 88% of Olist orders are single-item.
    if (!orderCategory.has(orderId)) orderCategory.set(orderId, category);
    orderTotal.set(orderId, (orderTotal.get(orderId) ?? 0) + itemPrice + (freight || 0));
  }

  const aov = new Map<string, number[]>();
  for (const [orderId, total] of orderTotal) {
    const category = orderCategory.get(orderId);
    if (category) push(aov, category, total);
  }

  const deliveryDays = new Map<string, number[]>();
  const ordersPerCategory = new Map<string, number>();
  for (const o of readCsv('olist_orders_dataset.csv')) {
    const category = orderCategory.get(o['order_id'] ?? '');
    if (!category) continue;
    ordersPerCategory.set(category, (ordersPerCategory.get(category) ?? 0) + 1);
    // The promised ETA the seller shows, not the delivery that actually happened —
    // the engine reasons about what the buyer saw on the PDP.
    const purchased = Date.parse(o['order_purchase_timestamp'] ?? '');
    const estimated = Date.parse(o['order_estimated_delivery_date'] ?? '');
    if (Number.isFinite(purchased) && Number.isFinite(estimated)) {
      push(deliveryDays, category, (estimated - purchased) / 86_400_000);
    }
  }

  const reviewAvg = new Map<string, number[]>();
  for (const r of readCsv('olist_order_reviews_dataset.csv')) {
    const category = orderCategory.get(r['order_id'] ?? '');
    if (category) push(reviewAvg, category, num(r['review_score']));
  }

  // ---- media metrics: one distribution, shared by every category

  const metaFile = [...rawFiles.keys()].find((f) => /conversion_data|facebook.*ad/i.test(f));
  if (!metaFile) {
    throw new Error(
      `No facebook-ad-campaign CSV in ${RAW} — expected KAG_conversion_data.csv.\n` +
        `  kaggle datasets download -d madislemsalu/facebook-ad-campaign --unzip -p data/raw`,
    );
  }
  const ctrValues: number[] = [];
  const cpmValues: number[] = [];
  const cvrValues: number[] = [];
  for (const ad of readCsv(metaFile)) {
    const impressions = num(ad['Impressions'] ?? ad['impressions']);
    const clicks = num(ad['Clicks'] ?? ad['clicks']);
    const spent = num(ad['Spent'] ?? ad['spent']);
    const conversions = num(ad['Approved_Conversion'] ?? ad['approved_conversion']);
    if (impressions > 0) {
      ctrValues.push(clicks / impressions);
      cpmValues.push((spent / impressions) * 1000);
    }
    if (clicks > 0) cvrValues.push(conversions / clicks);
  }
  // Measured, printed, and deliberately not shipped — see MEDIA_PRIORS.
  const measured = {
    cpm: distribution(cpmValues, 'kaggle_meta'),
    ctr: distribution(ctrValues, 'kaggle_meta'),
    cvr: distribution(cvrValues, 'kaggle_meta'),
  };
  console.log(
    `\n  ${metaFile} measures cpm ${measured.cpm.median}, ctr ${measured.ctr.median}, ` +
      `cvr ${measured.cvr.median} over ${measured.ctr.n} rows.\n` +
      `  Shipping published BRL priors instead: cpm ${MEDIA_PRIORS.cpm.median}, ` +
      `ctr ${MEDIA_PRIORS.ctr.median}, cvr ${MEDIA_PRIORS.cvr.median}, all n=0.`,
  );

  // ---- assemble

  const categories = [...ordersPerCategory.entries()]
    .filter(([, n]) => n >= MIN_ORDERS)
    .map(([category]) => category)
    .sort();

  const skipped = ordersPerCategory.size - categories.length;
  const table: Record<string, { category: string; metrics: Record<BenchmarkMetric, Distribution> }> = {};

  for (const category of categories) {
    table[category] = {
      category,
      metrics: {
        ...MEDIA_PRIORS,
        aov: distribution(aov.get(category) ?? [], 'olist'),
        price: distribution(price.get(category) ?? [], 'olist'),
        freightRatio: distribution(freightRatio.get(category) ?? [], 'olist'),
        deliveryDays: distribution(deliveryDays.get(category) ?? [], 'olist'),
        reviewAvg: distribution(reviewAvg.get(category) ?? [], 'olist'),
        photos: distribution(photos.get(category) ?? [], 'olist'),
        descriptionLength: distribution(descriptionLength.get(category) ?? [], 'olist'),
      },
    };
  }

  deriveSellers();

  writeFileSync(OUT_JSON, `${JSON.stringify(table, null, 2)}\n`);
  // A runtime array, with the union derived from it — not a bare `type`. The union alone
  // erases at build time, so nothing downstream could validate a category it was handed:
  // `productCardSchema` had `z.string()` there and accepted any string in the world.
  writeFileSync(
    OUT_CATEGORIES,
    '// Generated by derive.ts from product_category_name_translation.csv. Do not edit.\n' +
      `// ${categories.length} categories, each with at least ${MIN_ORDERS} Olist orders behind it.\n` +
      'export const OLIST_CATEGORIES = [\n' +
      categories.map((c) => `  '${c}',`).join('\n') +
      '\n] as const;\n\n' +
      'export type OlistCategory = (typeof OLIST_CATEGORIES)[number];\n',
  );

  console.log(
    `\n${categories.length} categories written, ${skipped} skipped under ${MIN_ORDERS} orders.\n` +
      `  ${OUT_JSON}\n  ${OUT_CATEGORIES}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main();

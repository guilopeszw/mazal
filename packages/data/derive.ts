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
const OUT_CATEGORIES = join(import.meta.dirname, 'categories.ts');

/** Categories below this many orders have quartiles too noisy to show a seller. */
const MIN_ORDERS = 30;

type Distribution = {
  median: number;
  p25: number;
  p75: number;
  n: number;
  source: 'olist' | 'kaggle_meta';
};

type BenchmarkMetric =
  | 'cpm' | 'ctr' | 'atcRate' | 'icRate' | 'cvr' | 'aov'
  | 'price' | 'freightRatio' | 'deliveryDays'
  | 'reviewAvg' | 'photos' | 'descriptionLength';

/**
 * Mid-funnel priors. The facebook-ad-campaign dataset has impressions, clicks and
 * conversions and nothing between them, so these two are published category medians
 * rather than something measured here. Flagged `kaggle_meta` and printed as an
 * estimate in the UI — do not launder an estimate as a measurement.
 */
const MID_FUNNEL_PRIORS: Record<'atcRate' | 'icRate', Distribution> = {
  atcRate: { median: 0.08, p25: 0.045, p75: 0.12, n: 0, source: 'kaggle_meta' },
  icRate: { median: 0.45, p25: 0.32, p75: 0.6, n: 0, source: 'kaggle_meta' },
};

// ---------------------------------------------------------------- csv

/**
 * Parses RFC-4180-ish CSV: quoted fields, doubled quotes, commas and newlines
 * inside quotes. Olist's review comments contain all three.
 */
export function parseCsv(text: string): Record<string, string>[] {
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

function readCsv(name: string): Record<string, string>[] {
  const path = join(RAW, name);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}\n\nDownload both datasets into data/raw/ (gitignored) — see docs/plan/B-data.md:\n` +
        `  kaggle datasets download -d olistbr/brazilian-ecommerce --unzip -p data/raw\n` +
        `  kaggle datasets download -d madislemsalu/facebook-ad-campaign --unzip -p data/raw`,
    );
  }
  const rows = parseCsv(readFileSync(path, 'utf8'));
  console.log(`  ${name.padEnd(44)} ${rows.length.toLocaleString('en-US').padStart(9)} rows`);
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

  const metaFile = readdirSync(RAW).find((f) => /conversion_data|facebook.*ad/i.test(f));
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
  const media: Record<'cpm' | 'ctr' | 'cvr', Distribution> = {
    cpm: distribution(cpmValues, 'kaggle_meta'),
    ctr: distribution(ctrValues, 'kaggle_meta'),
    cvr: distribution(cvrValues, 'kaggle_meta'),
  };

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
        ...media,
        ...MID_FUNNEL_PRIORS,
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

  writeFileSync(OUT_JSON, `${JSON.stringify(table, null, 2)}\n`);
  writeFileSync(
    OUT_CATEGORIES,
    '// Generated by derive.ts from product_category_name_translation.csv. Do not edit.\n' +
      'export type OlistCategory =\n' +
      categories.map((c) => `  | '${c}'`).join('\n') +
      ';\n',
  );

  console.log(
    `\n${categories.length} categories written, ${skipped} skipped under ${MIN_ORDERS} orders.\n` +
      `  ${OUT_JSON}\n  ${OUT_CATEGORIES}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main();

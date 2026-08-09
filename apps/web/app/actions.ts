"use server";

import {
  OLIST_CATEGORIES,
  type Action,
  type CampaignDay,
  type CardProvenance,
  type OlistCategory,
  type ProductCard,
} from "@mazal/contracts";
import { benchmarks } from "@mazal/data";
import { parseMetaCsv, productCardSchema } from "@mazal/ingest";
import { buildUploadAnswer, type Answer } from "@/lib/answers";
import { execute, undo, type ExecutionResult } from "@/lib/meta";
import { formatCount, formatPercent } from "@/lib/format";

/**
 * The upload path runs on the server for the same reason `buildAnswers` does: parsing and
 * diagnosis both need tables the browser must never download. The seller's own CSV rows are
 * the only thing that crosses the wire, in both directions.
 */

export async function parseCsv(
  text: string,
): Promise<{ days: CampaignDay[]; warnings: string[]; currency?: string }> {
  // Trust boundary: cap the payload rather than let an arbitrary paste sit in memory.
  if (typeof text !== "string" || text.length > 5_000_000) {
    return { days: [], warnings: ["File too large — export a shorter date range (under 5 MB)."] };
  }
  return parseMetaCsv(text);
}

/**
 * What Mazal will assume for the fields the seller is not asked for, per category.
 * Sent to the browser so the seller can see and correct every guess before it is used —
 * three medians for one category, not the table.
 */
export async function categoryDefaults(category: OlistCategory) {
  if (!OLIST_CATEGORIES.includes(category)) throw new Error(`Unknown category: ${category}`);
  const m = benchmarks[category].metrics;
  return {
    reviewAvg: Math.round(m.reviewAvg.median * 10) / 10,
    pdpImages: Math.round(m.photos.median),
    pdpDescriptionLength: Math.round(m.descriptionLength.median),
  };
}

/** The fields the seller states; everything else is inferred unless corrected. */
export type StatedCard = {
  category: OlistCategory;
  price: number;
  shippingCost: number;
  deliveryEtaDays: number;
};

/** The inferred fields the form exposes for correction. */
export type InferredNumericField =
  | "grossMargin"
  | "stockOnHand"
  | "reviewCount"
  | "reviewAvg"
  | "pdpImages"
  | "pdpDescriptionLength"
  | "returnPolicyDays";

/** Category-independent assumptions. The category-sensitive three come from the table. */
const STATIC_DEFAULTS: Record<Exclude<InferredNumericField, "reviewAvg" | "pdpImages" | "pdpDescriptionLength">, number> = {
  grossMargin: 0.3,
  stockOnHand: 100,
  reviewCount: 10,
  returnPolicyDays: 7,
};

const FIELD_WORDS: Record<InferredNumericField, string> = {
  grossMargin: "gross margin",
  stockOnHand: "stock on hand",
  reviewCount: "review count",
  reviewAvg: "average rating",
  pdpImages: "photos on the listing",
  pdpDescriptionLength: "description length",
  returnPolicyDays: "return policy days",
};

export async function diagnoseUpload(input: {
  fileName: string;
  days: CampaignDay[];
  stated: StatedCard;
  /** Inferred fields the seller corrected — those become `stated` too. */
  corrections: Partial<Record<InferredNumericField, number>>;
}): Promise<{ ok: true; answer: Answer } | { ok: false; error: string }> {
  const { days, stated, corrections } = input;

  // ponytail: shape guard only — the values inside came out of our own parser, and the
  // engine's safeDiv arithmetic tolerates garbage counts without exploding.
  if (!Array.isArray(days) || days.length === 0 || days.length > 400) {
    return { ok: false, error: "No usable daily rows to diagnose." };
  }

  const m = benchmarks[stated.category]?.metrics;
  if (!m) return { ok: false, error: `Unknown category: ${String(stated.category)}` };

  const card: ProductCard = {
    category: stated.category,
    price: stated.price,
    shippingCost: stated.shippingCost,
    deliveryEtaDays: stated.deliveryEtaDays,
    grossMargin: STATIC_DEFAULTS.grossMargin,
    stockOnHand: STATIC_DEFAULTS.stockOnHand,
    reviewCount: STATIC_DEFAULTS.reviewCount,
    returnPolicyDays: STATIC_DEFAULTS.returnPolicyDays,
    reviewAvg: Math.round(m.reviewAvg.median * 10) / 10,
    pdpImages: Math.round(m.photos.median),
    pdpDescriptionLength: Math.round(m.descriptionLength.median),
    // Never read by diagnose's attribution, so not worth a form control this weekend.
    paymentMethods: ["credit", "debit", "pix", "boleto", "installments"],
    offer: "none",
    ...corrections,
  };

  const parsed = productCardSchema.safeParse(card);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product card." };
  }

  /**
   * Provenance, per the contract: the four asked fields and any corrected ones are
   * `stated`; every untouched default stays `inferred`. A passive submit is not acceptance,
   * so nothing here is ever marked `confirmed`.
   */
  const provenance: CardProvenance = {
    category: "stated",
    price: "stated",
    shippingCost: "stated",
    deliveryEtaDays: "stated",
  };
  const inferred: InferredNumericField[] = [];
  for (const field of Object.keys(FIELD_WORDS) as InferredNumericField[]) {
    if (corrections[field] !== undefined) provenance[field] = "stated";
    else {
      provenance[field] = "inferred";
      inferred.push(field);
    }
  }

  const noteSuffix = inferred.length
    ? ` Mazal assumed, not you: ${inferred
        .map((f) =>
          f === "grossMargin"
            ? `${FIELD_WORDS[f]} ${formatPercent(card.grossMargin)}`
            : `${FIELD_WORDS[f]} ${formatCount(card[f])}`,
        )
        .join(", ")}. Correct any of them in the upload form and diagnose again.`
    : "";

  return {
    ok: true,
    answer: buildUploadAnswer(days, parsed.data, [], `Diagnose ${input.fileName}`, noteSuffix),
  };
}

/**
 * Running a plan, from the screen.
 *
 * A server action rather than the public `/api/execute` route, for one reason:
 * the route now needs a shared secret before it will touch a real account, and
 * a browser cannot hold a secret. Shipping one to the client would be theatre —
 * anyone could read it out of the bundle.
 *
 * Here the secret is never needed at all. The action runs on the server, and
 * Next only dispatches it for its own encrypted action id, so it is not an
 * endpoint someone can discover and POST to. `/api/execute` stays for callers
 * outside the browser, and those bring the secret.
 */
export async function runPlan(
  actions: Action[],
  /**
   * Sent by the caller and remembered here, so a double-click, a retry or a
   * refresh cannot run the same plan twice. Pausing twice is harmless; halving
   * a budget twice is a quarter of what the seller set.
   */
  idempotencyKey?: string,
): Promise<{
  receipt: string;
  mode: "simulated" | "live";
  results: { id: string; detail: string; ok: boolean }[];
  undo: NonNullable<ExecutionResult["undo"]>[];
}> {
  if (idempotencyKey) {
    const already = alreadyRun.get(idempotencyKey);
    if (already) return already;
  }
  // Same rule as the route, restated rather than imported: Mazal never performs
  // what only the seller can do, and this is a second front door.
  const mine = actions.filter((a) => a?.actor === "mazal").slice(0, 20);

  const results: (ExecutionResult & { id: string })[] = [];
  for (const a of mine) {
    if (!a.execution) {
      results.push({ id: a.id, mode: "simulated", ok: true, detail: "no executable operation — logged only" });
      continue;
    }
    results.push({ id: a.id, ...(await execute(a.execution)) });
  }

  const live = results.some((r) => r.mode === "live");
  const at = new Date().toISOString();
  const answer = {
    receipt: `MZL-${at.slice(0, 10).replace(/-/g, "")}-${String(Date.now() % 10000).padStart(4, "0")}`,
    mode: (live ? "live" : "simulated") as "simulated" | "live",
    results: results.map(({ id, detail, ok }) => ({ id, detail, ok })),
    undo: results.flatMap((r) => (r.undo ? [r.undo] : [])),
  };

  if (idempotencyKey) alreadyRun.set(idempotencyKey, answer);
  return answer;
}

/** In memory, like the log. It only has to outlive a double-click. */
const alreadyRun = new Map<string, Awaited<ReturnType<typeof runPlan>>>();

/**
 * Put back what a run changed.
 *
 * Only restores values Mazal itself recorded before writing, and only on the
 * three fields the three operations touch — an undo that accepts arbitrary
 * field/value pairs would be the unrestricted write channel this product
 * deliberately does not have.
 */
export async function undoRun(
  entries: NonNullable<ExecutionResult["undo"]>[],
): Promise<{ ok: boolean; details: string[] }> {
  const out: string[] = [];
  let ok = true;
  for (const e of entries.slice(0, 20)) {
    const r = await undo(e);
    out.push(r.detail);
    if (!r.ok) ok = false;
  }
  return { ok, details: out };
}

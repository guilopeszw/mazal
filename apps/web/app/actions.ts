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
import { foldDaysByDate } from "@mazal/meta";
import { buildPreflightAnswer, buildUploadAnswer, type Answer } from "@/lib/answers";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { record } from "@/lib/audit";
import { execute, executeConfigured, undo, type ExecutionResult } from "@/lib/meta";
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

  const parsed = parseMetaCsv(text);

  /**
   * One row per day, whatever the export was broken out by.
   *
   * `parseMetaCsv` emits one `CampaignDay` per CSV *row* and does not group by
   * date, which is right for a parser — the rows are what the file says. But an
   * Ads Manager export broken out by ad set or by ad has several rows for the
   * same day, and `diagnose` reads the last seven *entries*. Three ad sets over
   * thirty days would arrive as ninety "days" and the seven-day window would
   * cover two and a half real ones, then answer with full confidence about
   * them. Nothing on screen would look wrong.
   *
   * Folding here rather than in the parser keeps that decision where the window
   * is: this is the only path that hands rows to the engine.
   */
  const days = foldDaysByDate(parsed.days);
  const merged = parsed.days.length - days.length;

  return {
    ...parsed,
    days,
    warnings: [
      ...parsed.warnings,
      ...(merged > 0
        ? [
            `This export has more than one row per day — it is broken out by ad set or by ad. ` +
              `${parsed.days.length} rows were added up into ${days.length} days.`,
          ]
        : []),
    ],
  };
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

/**
 * "Is this product worth advertising?" for a card the seller filled in.
 *
 * The one answer that survives a seller whose checkout Mazal cannot see: it
 * reads the product and the category table, so it needs no pixel, no
 * conversions and no campaign at all. Until this existed, the pre-flight chip
 * rendered the fixture's card and there was no path from an upload to a
 * pre-flight on the seller's own product.
 */
/**
 * The full card the form implies: four fields the seller stated, three medians
 * from their category, four flat defaults, and their own corrections last.
 *
 * One builder for both actions. `productCardSchema` is `.strict()` with fifteen
 * required fields, so an action that assembles its own subset does not merely
 * lose a default — it fails validation on every call. That is exactly what the
 * pre-flight did before this existed, and no test caught it because the test
 * called the answer builder directly and never went through the action.
 */
function cardFrom(
  stated: StatedCard,
  corrections: Partial<Record<InferredNumericField, number>>,
): { ok: true; card: ProductCard } | { ok: false; error: string } {
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
  return { ok: true, card: parsed.data };
}

export async function preflightUpload(input: {
  stated: StatedCard;
  corrections: Partial<Record<InferredNumericField, number>>;
}): Promise<{ ok: true; answer: Answer } | { ok: false; error: string }> {
  if (!input?.stated) return { ok: false, error: "No product to check." };

  const built = cardFrom(input.stated, input.corrections ?? {});
  if (!built.ok) return built;

  /**
   * Break-even is `1 / grossMargin`, so when the margin is Mazal's default the
   * assumption *is* the verdict. Said out loud, the way the diagnosis path says
   * it — a number the seller never gave should never arrive unlabelled.
   */
  // Touched, not equal. Comparing the value cannot tell Mazal's default from a
  // seller who typed the same number, and told that seller Mazal had assumed a
  // figure they had just stated — then asked them to go correct it. This is the
  // signal `diagnoseUpload` already keys on, so the two paths agree about who
  // authored a number.
  const assumedMargin = input.corrections?.grossMargin === undefined;
  return {
    ok: true,
    answer: buildPreflightAnswer(
      built.card,
      "Is this product worth advertising?",
      assumedMargin
        ? ` Mazal assumed, not you: a gross margin of ${formatPercent(STATIC_DEFAULTS.grossMargin)}. Break-even is that number inverted, so correct it above if it is wrong and ask again.`
        : "",
    ),
  };
}

export async function diagnoseUpload(input: {
  fileName: string;
  days: CampaignDay[];
  stated: StatedCard;
  /** Inferred fields the seller corrected — those become `stated` too. */
  corrections: Partial<Record<InferredNumericField, number>>;
}): Promise<{ ok: true; answer: Answer } | { ok: false; error: string }> {
  if (!input?.stated) return { ok: false, error: "No campaign to diagnose." };
  const { days, stated, corrections } = input;

  // ponytail: shape guard only — the values inside came out of our own parser, and the
  // engine's safeDiv arithmetic tolerates garbage counts without exploding.
  if (!Array.isArray(days) || days.length === 0 || days.length > 400) {
    return { ok: false, error: "No usable daily rows to diagnose." };
  }

  const built = cardFrom(stated, corrections);
  if (!built.ok) return built;
  const parsed = { data: built.card };

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
            ? `${FIELD_WORDS[f]} ${formatPercent(parsed.data.grossMargin)}`
            : `${FIELD_WORDS[f]} ${formatCount(parsed.data[f])}`,
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
  /** Opaque handle. The undo record itself never leaves the server. */
  undoToken: string | null;
  /** True when the account is real and nobody has unlocked execution yet. */
  locked?: true;
}> {
  if (!(await executionAuthorised())) {
    return { receipt: "", mode: "simulated", results: [], undoToken: null, locked: true };
  }

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
    undoToken: null as string | null,
  };

  record(
    results.map((r) => ({
      at,
      receipt: answer.receipt,
      mode: r.mode,
      actionId: r.id,
      ...(r.target ? { target: r.target } : {}),
      detail: r.detail,
      ok: r.ok,
      undoable: Boolean(r.undo),
    })),
  );

  const undoable = results.flatMap((r) => (r.undo ? [r.undo] : []));
  if (undoable.length > 0) {
    // Handed out as an unguessable id. The client can ask for the undo to
    // happen; it cannot say what the undo is.
    const token = randomUUID();
    undoStore.set(token, undoable);
    answer.undoToken = token;
  }

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
export async function undoRun(token: string): Promise<{ ok: boolean; details: string[]; locked?: true }> {
  if (!(await executionAuthorised())) return { ok: false, details: [], locked: true };

  const entries = undoStore.get(token);
  if (!entries) return { ok: false, details: ["That run is not one this server can undo."] };

  // Single use. A replayed token is a second write nobody asked for.
  undoStore.delete(token);

  const out: string[] = [];
  const at = new Date().toISOString();
  let ok = true;
  for (const e of entries.slice(0, 20)) {
    const r = await undo(e);
    out.push(r.detail);
    if (!r.ok) ok = false;
    // An undo is a write too, and belongs in the record beside the run it reversed.
    record([{ at, receipt: `undo:${token.slice(0, 8)}`, mode: r.mode, actionId: e.field, ...(r.target ? { target: r.target } : {}), detail: r.detail, ok: r.ok, undoable: false }]);
  }
  return { ok, details: out };
}

/** Undo records, server-side only, keyed by a handle the client cannot forge. */
const undoStore = new Map<string, NonNullable<ExecutionResult["undo"]>[]>();

/**
 * Both of the actions above change a real account when credentials are present,
 * and a server action is a POST endpoint like any other — its id is in the
 * client bundle, so "hard to discover" is not a control. Without this, anyone
 * who found the deployment could pause the campaign, or undo a pause.
 *
 * Live mode requires a cookie that only `unlockExecution` sets, and that needs
 * the same shared secret `/api/execute` does. Simulated mode is ungated,
 * because it cannot touch anything.
 */
/**
 * Returns a boolean rather than throwing.
 *
 * Next redacts server-action error messages in production, so the screen could
 * never tell "you must unlock" apart from "something broke" — it showed a
 * generic failure and the seller had no way forward. A refusal the caller can
 * act on has to be part of the return type, not smuggled through an exception.
 */
async function executionAuthorised(): Promise<boolean> {
  if (!executeConfigured()) return true;

  const secret = process.env["MAZAL_EXECUTE_SECRET"];
  if (!secret) return false;

  const jar = await cookies();
  return jar.get("mazal-exec")?.value === secret;
}

/** Exchange the shared secret for a session cookie. The secret never reaches the client. */
export async function unlockExecution(secret: string): Promise<{ ok: boolean }> {
  const expected = process.env["MAZAL_EXECUTE_SECRET"];
  if (!expected || secret !== expected) return { ok: false };

  const jar = await cookies();
  /**
   * Fifteen minutes. Authorisation to spend someone's money should be measured
   * in minutes, not "until you close the tab" — an unlocked session left open
   * on a laptop is a standing permission nobody granted.
   */
  jar.set("mazal-exec", expected, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
    maxAge: 15 * 60,
  });
  return { ok: true };
}

/** Whether the screen should ask for the unlock before offering to run anything. */
export async function executionNeedsUnlock(): Promise<boolean> {
  if (!executeConfigured()) return false;
  const jar = await cookies();
  return jar.get("mazal-exec")?.value !== process.env["MAZAL_EXECUTE_SECRET"];
}

import {
  OLIST_CATEGORIES,
  STORE_EVENT_TYPES,
  type Action,
  type CampaignDay,
  type Diagnosis,
  type ProductCard,
  type StoreEvent,
} from '@mazal/contracts';
import { z } from 'zod';

/**
 * Upper bounds at the tool boundary.
 *
 * Every array here was unbounded and no string had a length cap, so an
 * authenticated caller could post a million `CampaignDay`s and make the engine
 * chew through all of them inside one request. `apps/web/app/api/execute/route.ts`
 * has said "a thousand of them is not a plan" since the day it was written; the
 * MCP path is the same sink reached a different way and gets the same limits.
 *
 * These are deliberately generous against real use — three years of daily rows,
 * a store event every other day — so the only requests they reject are the ones
 * nobody meant to send.
 */
export const MAX_DAYS = 1100;
const MAX_EVENTS = 500;
const MAX_ACTIONS = 20;
/** A raw insights response is one row per entity per day, so it needs headroom. */
export const MAX_INSIGHT_ROWS = 5000;
/**
 * Rows, not days: a payload broken out by ad set carries several rows per day.
 * The handler checks the folded day count against `MAX_DAYS` afterwards, so the
 * two doors into the engine end up with the same limit rather than one that is
 * five times looser depending on how you arrived.
 */
/** Meta returns a couple of dozen action types on a busy account; this product reads three. */
const MAX_ACTION_TYPES = 60;


const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const count = nonNegativeNumber.int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

type Assert<T extends true> = T;
type SchemaOutputMatches<TSchema extends z.ZodType, TContract> =
  undefined extends null
    ? true
    : z.output<TSchema> extends TContract
      ? true
      : false;

export const campaignDaySchema: z.ZodType<CampaignDay> = z.object({
  date: isoDate,
  campaignId: z.string().min(1).max(120),
  spend: nonNegativeNumber,
  impressions: count,
  reach: count,
  clicks: count,
  addToCarts: count,
  checkoutsInitiated: count,
  purchases: count,
  revenue: nonNegativeNumber,
  sessions: count.optional(),
  bounceRate: finiteNumber.min(0).max(1).optional(),
}).strict();

export const productCardSchema: z.ZodType<ProductCard> = z.object({
  category: z.enum(OLIST_CATEGORIES),
  price: finiteNumber.positive(),
  grossMargin: finiteNumber.gt(0).max(1),
  shippingCost: nonNegativeNumber,
  deliveryEtaDays: count,
  stockOnHand: count,
  reviewCount: count,
  reviewAvg: finiteNumber.min(1).max(5),
  pdpImages: count,
  pdpDescriptionLength: count,
  returnPolicyDays: count,
  // Five members in the enum, so five is the most a real card can carry. The
  // array was the last unbounded one at the boundary: the elements were
  // constrained and the length was not, which still lets a caller send a
  // million of them.
  paymentMethods: z
    .array(z.enum(['credit', 'debit', 'pix', 'boleto', 'installments']))
    .min(1)
    .max(5),
  offer: z.enum(['none', 'discount', 'bundle', 'free_shipping_threshold']),
}).strict();

export const storeEventSchema: z.ZodType<StoreEvent> = z.object({
  date: isoDate,
  type: z.enum(STORE_EVENT_TYPES),
  detail: z.string().min(1).max(600),
}).strict();

const findingSchema = z.object({
  stage: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3),
    z.literal(4), z.literal(5), z.literal(6),
  ]),
  severity: z.enum(['primary', 'secondary']),
  metric: z.string().min(1).max(80),
  observed: finiteNumber,
  reference: finiteNumber,
  spread: finiteNumber,
  deviation: finiteNumber,
  sampleSize: count,
  rule: z.string().min(1).max(200),
  causeLayer: z.enum(['media', 'product', 'offer', 'experience']),
  evidence: storeEventSchema.optional(),
}).strict();

const diagnosisSchemaDefinition = z.object({
  primary: findingSchema.nullable(),
  secondary: z.array(findingSchema).max(20),
  suspectedCause: z.enum([
    'none',
    'stockout',
    'eta_shock',
    'creative_fatigue',
    'price_too_high',
    'checkout_friction',
    'pixel_break',
    'budget_cap',
    'thin_pdp',
  ]),
  changePoint: z.object({ date: isoDate, metric: z.string().min(1).max(80) }).strict().optional(),
}).strict();

type _DiagnosisSchemaMatchesContract = Assert<
  SchemaOutputMatches<typeof diagnosisSchemaDefinition, Diagnosis>
>;

// Vercel's Function builder typechecks with strictNullChecks disabled. Zod 4
// then reports required fields inside nullable objects as optional, even though
// the runtime schema still requires them. The strict build above keeps the
// contract check; this assertion only bridges that compiler-mode mismatch.
export const diagnosisSchema = diagnosisSchemaDefinition as z.ZodType<Diagnosis>;

export const actionSchema: z.ZodType<Action> = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  change: z.string().min(1).max(600),
  expectedEffect: z.object({
    metric: z.string().min(1),
    from: finiteNumber,
    to: finiteNumber,
  }).strict(),
  confidence: z.enum(['low', 'medium', 'high']),
  reversible: z.boolean(),
  actor: z.enum(['mazal', 'seller']),
}).strict();

export const publicReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('benchmark') }).strict(),
  z.object({ kind: z.literal('self'), baselineDays: z.number().int().positive() }).strict(),
]);

/**
 * A raw Meta insights response, as `GET /act_<id>/insights` returns it.
 *
 * Every number is a string here because that is what the Graph API sends; the
 * parsing lives in `@mazal/meta`, which is the only thing in the product
 * allowed to turn Meta's vocabulary into the contract's.
 *
 * **Not `.strict()`, unlike every other schema in this file.** The others
 * describe shapes this repo defines, where an unexpected key means the caller
 * misunderstood the contract. This one describes someone else's API, and Meta
 * returns `ctr`, `cpc`, `cpm`, `frequency`, `objective` and `account_name`
 * depending on the preset and on what was asked for. Rejecting those would mean
 * a real response cannot be sent to the tool at all, and would break again on
 * whatever Meta adds next quarter. Zod's default strip drops them, so nothing
 * downstream can read a rate — which is the actual thing being defended.
 */
const metaActionSchema = z.object({
  action_type: z.string().min(1).max(120),
  value: z.string().max(40),
});

const metaInsightsRowSchema = z.object({
  date_start: isoDate,
  date_stop: isoDate,
  campaign_id: z.string().min(1).max(120),
  campaign_name: z.string().min(1).max(200),
  adset_id: z.string().min(1).max(120).optional(),
  adset_name: z.string().min(1).max(200).optional(),
  account_id: z.string().max(120).optional(),
  account_currency: z.string().max(8).optional(),
  spend: z.string().max(24),
  impressions: z.string().max(24),
  reach: z.string().max(24),
  inline_link_clicks: z.string().max(24),
  actions: z.array(metaActionSchema).max(MAX_ACTION_TYPES).optional(),
  action_values: z.array(metaActionSchema).max(MAX_ACTION_TYPES).optional(),
});

export const metaInsightsPayloadSchema = z.object({
  data: z.array(metaInsightsRowSchema).min(1).max(MAX_INSIGHT_ROWS),
  paging: z.object({
    cursors: z.object({
      before: z.string().max(2000).optional(),
      after: z.string().max(2000).optional(),
    }).optional(),
    next: z.string().max(4000).optional(),
    previous: z.string().max(4000).optional(),
  }).optional(),
  __mazal_fixture: z.object({
    kind: z.literal('fixture'),
    generator: z.string().max(200),
    derivedFrom: z.string().max(200),
    note: z.string().max(600),
  }).strict().optional(),
}).strict();

/**
 * `days` or `metaInsights`, exactly one.
 *
 * An object with a refinement rather than a union, on purpose: a union publishes
 * a JSON Schema whose root is `anyOf` in `tools/list`, and a client that expects
 * an object at the root stops being able to call the tool at all. This keeps the
 * root an object, keeps `.strict()`, and still refuses both-or-neither.
 *
 * The agent never converts a payload into days itself. If it did, the numbers
 * would come from an arithmetic no test in this repo covers — the same reason
 * the LLM is not allowed to compute anything else here.
 */
export const diagnoseCampaignInputSchema = z.object({
  days: z.array(campaignDaySchema).min(1).max(MAX_DAYS).optional(),
  metaInsights: metaInsightsPayloadSchema.optional(),
  card: productCardSchema,
  events: z.array(storeEventSchema).max(MAX_EVENTS),
  reference: publicReferenceSchema,
}).strict().refine(
  (input) => (input.days === undefined) !== (input.metaInsights === undefined),
  { message: 'Send `days` or `metaInsights`, exactly one of the two.' },
);

export const predictCampaignInputSchema = z.object({
  card: productCardSchema,
  history: z.array(campaignDaySchema).max(MAX_DAYS).optional(),
}).strict();

export const buildRecoveryPlanInputSchema = z.object({
  diagnosis: diagnosisSchema,
  card: productCardSchema,
}).strict();

export const executePlanInputSchema = z.object({
  actions: z.array(actionSchema).max(MAX_ACTIONS),
}).strict();

export type DiagnoseCampaignInput = z.infer<typeof diagnoseCampaignInputSchema>;
export type PredictCampaignInput = z.infer<typeof predictCampaignInputSchema>;
export type BuildRecoveryPlanInput = z.infer<typeof buildRecoveryPlanInputSchema>;
export type ExecutePlanInput = z.infer<typeof executePlanInputSchema>;

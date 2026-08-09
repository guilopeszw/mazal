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

const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const count = nonNegativeNumber.int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const campaignDaySchema: z.ZodType<CampaignDay> = z.object({
  date: isoDate,
  campaignId: z.string().min(1),
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
  paymentMethods: z.array(z.enum(['credit', 'debit', 'pix', 'boleto', 'installments'])).min(1),
  offer: z.enum(['none', 'discount', 'bundle', 'free_shipping_threshold']),
}).strict();

export const storeEventSchema: z.ZodType<StoreEvent> = z.object({
  date: isoDate,
  type: z.enum(STORE_EVENT_TYPES),
  detail: z.string().min(1),
}).strict();

const findingSchema = z.object({
  stage: z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3),
    z.literal(4), z.literal(5), z.literal(6),
  ]),
  severity: z.enum(['primary', 'secondary']),
  metric: z.string().min(1),
  observed: finiteNumber,
  reference: finiteNumber,
  spread: finiteNumber,
  deviation: finiteNumber,
  sampleSize: count,
  rule: z.string().min(1),
  causeLayer: z.enum(['media', 'product', 'offer', 'experience']),
  evidence: storeEventSchema.optional(),
}).strict();

export const diagnosisSchema: z.ZodType<Diagnosis> = z.object({
  primary: findingSchema.nullable(),
  secondary: z.array(findingSchema),
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
  changePoint: z.object({ date: isoDate, metric: z.string().min(1) }).strict().optional(),
}).strict();

export const actionSchema: z.ZodType<Action> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  change: z.string().min(1),
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

export const diagnoseCampaignInputSchema = z.object({
  days: z.array(campaignDaySchema).min(1),
  card: productCardSchema,
  events: z.array(storeEventSchema),
  reference: publicReferenceSchema,
}).strict();

export const predictCampaignInputSchema = z.object({
  card: productCardSchema,
  history: z.array(campaignDaySchema).optional(),
}).strict();

export const buildRecoveryPlanInputSchema = z.object({
  diagnosis: diagnosisSchema,
  card: productCardSchema,
}).strict();

export const executePlanInputSchema = z.object({
  actions: z.array(actionSchema),
}).strict();

export type DiagnoseCampaignInput = z.infer<typeof diagnoseCampaignInputSchema>;
export type PredictCampaignInput = z.infer<typeof predictCampaignInputSchema>;
export type BuildRecoveryPlanInput = z.infer<typeof buildRecoveryPlanInputSchema>;
export type ExecutePlanInput = z.infer<typeof executePlanInputSchema>;

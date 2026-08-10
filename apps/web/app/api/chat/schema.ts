import { OLIST_CATEGORIES, STORE_EVENT_TYPES } from "@mazal/contracts";
import { z } from "zod";

const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const count = nonNegativeNumber.int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const campaignDaySchema = z
  .object({
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
  })
  .strict();

const productCardSchema = z
  .object({
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
    paymentMethods: z
      .array(z.enum(["credit", "debit", "pix", "boleto", "installments"]))
      .min(1),
    offer: z.enum(["none", "discount", "bundle", "free_shipping_threshold"]),
  })
  .strict();

const storeEventSchema = z
  .object({
    date: isoDate,
    type: z.enum(STORE_EVENT_TYPES),
    detail: z.string().min(1).max(500),
  })
  .strict();

const publicReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("benchmark") }).strict(),
  z
    .object({
      kind: z.literal("self"),
      baselineDays: z.number().int().min(1).max(365),
    })
    .strict(),
]);

export const chatContextSchema = z
  .object({
    days: z.array(campaignDaySchema).min(1).max(400),
    card: productCardSchema,
    events: z.array(storeEventSchema).max(100),
    reference: publicReferenceSchema,
  })
  .strict();

export const chatRequestSchema = z
  .object({
    scenarioKey: z.enum(["case1", "case2"]).optional(),
    context: chatContextSchema.optional(),
    userMessage: z.string().min(1).max(2_000),
    conversationId: z.string().min(40).max(2_000).optional(),
  })
  .strict()
  .refine(({ scenarioKey, context }) => Boolean(scenarioKey) !== Boolean(context), {
    message: "Exactly one of scenarioKey or context is required",
  });

export type ChatContext = z.infer<typeof chatContextSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export function parseChatRequest(value: unknown): ChatRequest {
  return chatRequestSchema.parse(value);
}


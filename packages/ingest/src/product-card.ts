// ─── packages/ingest/src/product-card.ts ─────────────────────────────────
// Zod schema for ProductCard validation.
// The form component lives in apps/web; this schema is what it means.

import { z } from 'zod';
import { OLIST_CATEGORIES, type ProductCard } from '@mazal/contracts';

export const productCardSchema: z.ZodType<ProductCard> = z.object({
  // The 62 categories `pnpm derive` found in Olist. It was `z.string().min(1)`, which
  // accepted any string — and typechecked, because `OlistCategory` was declared with a
  // `| string` arm that collapsed the whole union. A category with no benchmark behind
  // it reaches the engine as a lookup that silently misses.
  category: z.enum(OLIST_CATEGORIES),
  price: z.number().positive('Price must be positive'),
  grossMargin: z.number().gt(0, 'Gross margin must be greater than 0').max(1, 'Gross margin must be between 0 and 1'),
  shippingCost: z.number().min(0, 'Shipping cost cannot be negative'),
  deliveryEtaDays: z.number().int('Delivery ETA must be a whole number').nonnegative('Delivery ETA cannot be negative'),
  stockOnHand: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative'),
  reviewCount: z.number().int('Review count must be a whole number').min(0, 'Review count cannot be negative'),
  reviewAvg: z.number().min(1, 'Review average must be between 1 and 5').max(5, 'Review average must be between 1 and 5'),
  pdpImages: z.number().int('Image count must be a whole number').min(0, 'Image count cannot be negative'),
  pdpDescriptionLength: z.number().int('Description length must be a whole number').min(0, 'Description length cannot be negative'),
  returnPolicyDays: z.number().int('Return policy must be a whole number').min(0, 'Return policy cannot be negative'),
  paymentMethods: z.array(
    z.enum(['credit', 'debit', 'pix', 'boleto', 'installments']),
  ).min(1, 'At least one payment method is required'),
  offer: z.enum(['none', 'discount', 'bundle', 'free_shipping_threshold']),
}).strict();

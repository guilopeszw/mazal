// ─── packages/ingest/src/product-card.ts ─────────────────────────────────
// Zod schema for ProductCard validation.
// The form component lives in apps/web; this schema is what it means.

import { z } from 'zod';
import type { ProductCard } from '@mazal/contracts';

export const productCardSchema: z.ZodType<ProductCard> = z.object({
  category: z.string().min(1, 'Category is required'),
  price: z.number().positive('Price must be positive'),
  grossMargin: z.number().min(0, 'Gross margin must be between 0 and 1').max(1, 'Gross margin must be between 0 and 1'),
  shippingCost: z.number().min(0, 'Shipping cost cannot be negative'),
  deliveryEtaDays: z.number().int('Delivery ETA must be a whole number').positive('Delivery ETA must be positive'),
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
});

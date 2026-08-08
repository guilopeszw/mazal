// ─── packages/ingest/src/product-card.test.ts ────────────────────────────
// Tests for the ProductCard Zod schema.

import { describe, expect, test } from 'vitest';
import { productCardSchema } from './product-card.js';

/** A valid product card for testing. */
const validCard = {
  category: 'health_beauty',
  price: 89.90,
  grossMargin: 0.65,
  shippingCost: 0,
  deliveryEtaDays: 5,
  stockOnHand: 120,
  reviewCount: 47,
  reviewAvg: 4.2,
  pdpImages: 6,
  pdpDescriptionLength: 850,
  returnPolicyDays: 30,
  paymentMethods: ['credit', 'pix', 'boleto'],
  offer: 'none' as const,
};

describe('productCardSchema', () => {
  test('validates a correct product card', () => {
    const result = productCardSchema.safeParse(validCard);
    expect(result.success).toBe(true);
  });

  test('accepts deliveryEtaDays of 0 (same-day delivery)', () => {
    const result = productCardSchema.safeParse({ ...validCard, deliveryEtaDays: 0 });
    expect(result.success).toBe(true);
  });

  test('rejects unknown extra keys due to .strict()', () => {
    const result = productCardSchema.safeParse({ ...validCard, unknownKey: 'extra' });
    expect(result.success).toBe(false);
  });

  test('rejects grossMargin of 0 to avoid division by zero in break-even ROAS', () => {
    const result = productCardSchema.safeParse({ ...validCard, grossMargin: 0 });
    expect(result.success).toBe(false);
  });

  test('rejects grossMargin below 0', () => {
    const result = productCardSchema.safeParse({ ...validCard, grossMargin: -0.1 });
    expect(result.success).toBe(false);
  });

  test('rejects grossMargin above 1', () => {
    const result = productCardSchema.safeParse({ ...validCard, grossMargin: 1.5 });
    expect(result.success).toBe(false);
  });

  test('accepts positive grossMargin up to 1', () => {
    expect(productCardSchema.safeParse({ ...validCard, grossMargin: 0.01 }).success).toBe(true);
    expect(productCardSchema.safeParse({ ...validCard, grossMargin: 1 }).success).toBe(true);
  });

  test('rejects empty paymentMethods array', () => {
    const result = productCardSchema.safeParse({ ...validCard, paymentMethods: [] });
    expect(result.success).toBe(false);
  });

  test('rejects invalid payment method', () => {
    const result = productCardSchema.safeParse({ ...validCard, paymentMethods: ['bitcoin'] });
    expect(result.success).toBe(false);
  });

  test('rejects reviewAvg below 1', () => {
    const result = productCardSchema.safeParse({ ...validCard, reviewAvg: 0.5 });
    expect(result.success).toBe(false);
  });

  test('rejects reviewAvg above 5', () => {
    const result = productCardSchema.safeParse({ ...validCard, reviewAvg: 5.1 });
    expect(result.success).toBe(false);
  });

  test('rejects negative price', () => {
    const result = productCardSchema.safeParse({ ...validCard, price: -10 });
    expect(result.success).toBe(false);
  });

  test('rejects non-integer deliveryEtaDays', () => {
    const result = productCardSchema.safeParse({ ...validCard, deliveryEtaDays: 3.5 });
    expect(result.success).toBe(false);
  });

  test('rejects invalid offer type', () => {
    const result = productCardSchema.safeParse({ ...validCard, offer: 'bogo' });
    expect(result.success).toBe(false);
  });

  test('produces field-level errors', () => {
    const result = productCardSchema.safeParse({
      ...validCard,
      grossMargin: 2.0,
      reviewAvg: 0,
      paymentMethods: [],
    });
    expect(result.success).toBe(false);

    if (!result.success) {
      const paths = result.error.issues.map(i => i.path[0]);
      expect(paths).toContain('grossMargin');
      expect(paths).toContain('reviewAvg');
      expect(paths).toContain('paymentMethods');
    }
  });

  test('accepts all valid payment methods', () => {
    const result = productCardSchema.safeParse({
      ...validCard,
      paymentMethods: ['credit', 'debit', 'pix', 'boleto', 'installments'],
    });
    expect(result.success).toBe(true);
  });

  test('accepts all valid offer types', () => {
    for (const offer of ['none', 'discount', 'bundle', 'free_shipping_threshold'] as const) {
      const result = productCardSchema.safeParse({ ...validCard, offer });
      expect(result.success).toBe(true);
    }
  });

  test('accepts shippingCost of 0 (free shipping)', () => {
    const result = productCardSchema.safeParse({ ...validCard, shippingCost: 0 });
    expect(result.success).toBe(true);
  });
});

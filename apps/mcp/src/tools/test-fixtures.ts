import type {
  Action,
  CampaignDay,
  Diagnosis,
  ProductCard,
} from '@mazal/contracts';

export const apparelCard: ProductCard = {
  category: 'fashion_bags_accessories',
  price: 49,
  grossMargin: 0.45,
  shippingCost: 20,
  deliveryEtaDays: 12,
  stockOnHand: 200,
  reviewCount: 80,
  reviewAvg: 4.5,
  pdpImages: 6,
  pdpDescriptionLength: 900,
  returnPolicyDays: 14,
  paymentMethods: ['credit', 'pix'],
  offer: 'none',
};

export function healthyDays(): CampaignDay[] {
  return Array.from({ length: 30 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    campaignId: 'mcp-fixture',
    spend: 400,
    impressions: 20_000,
    reach: 17_000,
    clicks: 220,
    addToCarts: 18,
    checkoutsInitiated: 8,
    purchases: 5,
    revenue: 345,
  }));
}

export const stockoutDiagnosis: Diagnosis = {
  primary: {
    stage: 3,
    severity: 'primary',
    metric: 'atcRate',
    observed: 0.01,
    reference: 0.08,
    spread: 0.02,
    deviation: -3.5,
    sampleSize: 1_540,
    rule: 'stage3.atcRate_below_benchmark',
    causeLayer: 'product',
  },
  secondary: [],
  suspectedCause: 'stockout',
  changePoint: { date: '2026-07-24', metric: 'atcRate' },
};

export const mazalAction: Action = {
  id: 'stockout.0',
  title: 'Pause the campaign until stock is back',
  change: 'Set the campaign to paused',
  expectedEffect: { metric: 'atcRate', from: 0.01, to: 0.08 },
  confidence: 'high',
  reversible: true,
  actor: 'mazal',
};

export const sellerAction: Action = {
  ...mazalAction,
  id: 'stockout.1',
  title: 'Hide the out-of-stock variant',
  change: 'Remove the sold-out variant from the product page',
  actor: 'seller',
};

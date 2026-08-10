import type { ProductCard } from "@mazal/contracts";

/** A card that satisfies the contract; the values do not matter to plan titles. */
export const apparelCard: ProductCard = {
  category: "watches_gifts",
  price: 189,
  grossMargin: 0.42,
  shippingCost: 22,
  deliveryEtaDays: 9,
  stockOnHand: 40,
  reviewCount: 18,
  reviewAvg: 4.3,
  pdpImages: 3,
  pdpDescriptionLength: 420,
  returnPolicyDays: 7,
  paymentMethods: ["credit", "pix", "boleto"],
  offer: "none",
};

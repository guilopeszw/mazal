import type { CampaignDay, ProductCard } from "@mazal/contracts";
import type { LabelledCampaign } from "@mazal/contracts";
import { fromMetaInsights } from "@mazal/meta";
import case1Json from "../../../packages/sim/fixtures/demo-case1.json";
import case2Json from "../../../packages/sim/fixtures/demo-case2.json";
import accountJson from "../../../packages/sim/fixtures/demo-account.json";
import case2Insights from "../../../packages/meta/fixtures/demo-case2.meta-insights.json";
import accountInsights from "../../../packages/meta/fixtures/demo-account.meta-insights.json";

/**
 * Where the demo's campaign numbers come from, and by which door.
 *
 * The days on screen arrive the way an integration would deliver them: as a raw
 * Meta insights payload, normalised by `@mazal/meta` at build time. The payload
 * is a fixture — it carries `__mazal_fixture` and no Meta account was called to
 * produce it — but the *path* is real, and it is the same `fromMetaInsights`
 * that `diagnose_campaign` calls on the MCP side. Swapping a live response in
 * is a change to one import, not to any of the arithmetic below it.
 *
 * `packages/meta/generate.ts` asserts the payload folds back to the simulator's
 * committed fixture exactly, so nothing on screen moves by going through it.
 * That is the point of doing it this way rather than trusting a copy.
 *
 * What does NOT come from Meta, and cannot: the product card. Price, margin,
 * stock, photos and delivery promise are the seller's twelve fields, they live
 * in the store rather than in Ads Manager, and diagnosing the half of the funnel
 * that they explain is the whole product.
 */
/**
 * This runs at module scope, so a payload the adapter refuses fails the build.
 * That is the right moment for it to fail — but the raw `MetaInsightsError`
 * stack says nothing about which file to regenerate, and whoever meets it will
 * be in a hurry.
 */
function read(payload: unknown, file: string) {
  try {
    return fromMetaInsights(payload);
  } catch (cause) {
    throw new Error(
      `packages/meta/fixtures/${file} is not a payload the adapter can read. ` +
        'Run `pnpm meta:fixtures` to regenerate it.',
      { cause },
    );
  }
}

const case2Meta = read(case2Insights, 'demo-case2.meta-insights.json');
const accountMeta = read(accountInsights, 'demo-account.meta-insights.json');

const case2Fixture = case2Json as unknown as LabelledCampaign;

export const demoCases = {
  /** Pre-flight: campaign #1 ran badly from day one; should campaign #2 launch? */
  case1: case1Json as unknown as LabelledCampaign,
  /** In-flight: two good weeks, then a stage broke mid-flight. */
  case2: { ...case2Fixture, days: case2Meta.total } satisfies LabelledCampaign,
} as const;

/**
 * One seller, three products, one wallet — the account the Allocator advises on.
 *
 * The response curves the simulator generated from are deliberately NOT in the
 * fixture. The engine has to recover them from the days like it would for a real
 * seller, and a fixture that shipped the answer next to the question would make
 * every number on the screen unfalsifiable.
 */
export type AccountProductFixture = {
  id: string;
  card: ProductCard;
  days: CampaignDay[];
  currentSpend: number;
};

const accountFixture = accountJson as unknown as {
  seed: number;
  products: AccountProductFixture[];
};

export const demoAccount = {
  seed: accountFixture.seed,
  products: accountFixture.products.map((product): AccountProductFixture => {
    /**
     * The join a real integration makes: the seller's card meets the ad account
     * at a campaign id. Nothing here matches on a label, because labels get
     * renamed in Ads Manager on a Tuesday and ids do not.
     */
    const campaignId = product.days[0]!.campaignId;
    const entity = accountMeta.entities.find((e) => e.id === campaignId);
    if (!entity) throw new Error(`No Meta campaign in the payload for ${product.id} (${campaignId})`);

    return {
      id: product.id,
      card: product.card,
      days: entity.days,
      // What this product is spending today, which is the budget the Allocator
      // holds constant. Read off the last day rather than carried alongside it:
      // an insights response says what was spent, and that is the honest source.
      currentSpend: entity.days.at(-1)!.spend,
    };
  }),
};


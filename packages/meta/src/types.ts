// ─── packages/meta/src/types.ts ──────────────────────────────────────────
// The payload as Meta sends it: `GET /act_<id>/insights`, time_increment=1.
//
// Every number is a string, because that is what the Graph API returns, and
// pretending otherwise here would move the parsing somewhere it is not tested.

/** One entry of `actions[]` or `action_values[]`. */
export type MetaAction = { action_type: string; value: string };

/**
 * One row: one entity, one day.
 *
 * `ctr`, `cpc`, `cpm` and `frequency` are fields Meta really does return, and
 * they are deliberately **not declared here**. The contract stores counts and
 * derives rates, and a rate that exists in the type is a rate someone reads on
 * a busy day instead of calling the function that defines it.
 */
export type MetaInsightsRow = {
  date_start: string;
  /** Equal to `date_start` under time_increment=1. Anything else is a range. */
  date_stop: string;
  campaign_id: string;
  campaign_name: string;
  /** Absent when the call was level=campaign, which is the common case. */
  adset_id?: string;
  adset_name?: string;
  account_id?: string;
  account_currency?: string;
  spend: string;
  impressions: string;
  reach: string;
  /** Link clicks. `clicks` in Meta's vocabulary counts every click on the ad. */
  inline_link_clicks: string;
  /**
   * Presence and content are different questions, and the difference is the
   * whole of "absence is not zero":
   *
   *   key absent          → we do not know          → META_INSIGHTS_INCOMPLETE
   *   array present, empty → it happened zero times → 0, legitimately
   */
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

export type MetaPaging = {
  cursors?: { before?: string; after?: string };
  next?: string;
};

/**
 * Not a Graph API field. Present on every payload this repo generates and
 * absent from anything that came from Meta, so the question "did this come from
 * a real account?" has an answer in the file rather than in someone's memory.
 */
export type FixtureStamp = {
  kind: 'fixture';
  generator: string;
  derivedFrom: string;
  note: string;
};

export type MetaInsightsPayload = {
  data: MetaInsightsRow[];
  paging?: MetaPaging;
  __mazal_fixture?: FixtureStamp;
};

/**
 * The action types we read, and the aliases Meta uses for each.
 *
 * A pixel event, an omni event and an offsite conversion are the same purchase
 * seen through three integrations, and which one an account emits depends on
 * how it was set up years ago. Reading only the short form works on our fixture
 * and fails on the first real account.
 */
export const ACTION_ALIASES = {
  addToCarts: ['add_to_cart', 'omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  checkoutsInitiated: [
    'initiate_checkout',
    'omni_initiated_checkout',
    'offsite_conversion.fb_pixel_initiate_checkout',
  ],
  purchases: ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'],
} as const satisfies Record<string, readonly string[]>;

export type CountedAction = keyof typeof ACTION_ALIASES;

// ─── packages/meta/src/account.ts ────────────────────────────────────────
// What comes out of the adapter: the contract's own types, arranged the way an
// ad account actually is — one wallet, several entities spending from it.

import type { CampaignDay } from '@mazal/contracts';
import type { FixtureStamp } from './types.ts';

/**
 * One entity's days.
 *
 * The entity key sits **outside** the row, which is what lets N entities exist
 * without a new field in `packages/contracts` — a package that is frozen and
 * belongs to someone else. `days[].campaignId` carries the id of the entity the
 * row measures, which is what that field has always meant; nothing downstream
 * reads it except as a label.
 */
export type MetaEntityDays = {
  /** `campaign_id`, or `adset_id` when the payload was broken out by ad set. */
  id: string;
  name: string;
  level: 'campaign' | 'adset';
  days: CampaignDay[];
};

export type MetaAccount = {
  /**
   * Every entity's days summed by date. This is what `diagnose` gets: it asks
   * what broke in one funnel, and three ad sets under one campaign are one
   * funnel seen in pieces.
   */
  total: CampaignDay[];
  /** In order of first appearance. One entry when the payload was one entity. */
  entities: MetaEntityDays[];
  currency?: string;
  /** Things worth saying out loud that are not worth refusing over. */
  warnings: string[];
  /** Set when the payload carried the fixture stamp. Absent means it did not. */
  fixture?: FixtureStamp;
};

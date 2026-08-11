import { benchmarks } from '@mazal/data';
import { diagnose } from '@mazal/engine';
import { fromMetaInsights, MetaInsightsError } from '@mazal/meta';
import type { CampaignDay, Diagnosis, ReferenceMode, StoreEvent } from '@mazal/contracts';

import {
  connectMetaMcp,
  fetchInsights,
  fetchSignalEvents,
  isMetaAdsEnabled,
  MetaMcpError,
  readMetaMcpConfig,
  type MetaMcpClient,
} from '../meta-client/index.js';
import { MAX_DAYS, diagnoseCampaignInputSchema } from '../schemas.js';

/**
 * What the adapter had to say about the payload, alongside the answer.
 *
 * The fixture stamp, the summed reach, the page that was not there — the
 * adapter produces these precisely so an agent does not present a half-read
 * campaign as a whole one. Returning only the `Diagnosis` threw all of it away
 * at the one boundary where the question "where did this data come from?" gets
 * asked.
 */
export type DiagnoseCampaignResult = { diagnosis: Diagnosis; notes: string[] };

export function diagnoseCampaignWithNotes(input: unknown): DiagnoseCampaignResult {
  const parsed = diagnoseCampaignInputSchema.parse(input);
  const reference: ReferenceMode = parsed.reference.kind === 'benchmark'
    ? { kind: 'benchmark', table: benchmarks }
    : parsed.reference;

  let days: CampaignDay[];
  const notes: string[] = [];

  if (parsed.days) {
    days = parsed.days;
  } else {
    const account = fromMetaInsights(parsed.metaInsights);

    /**
     * `META_ADS_ENABLED`, the flag PRD 10 asks for, doing the only useful job
     * available to it.
     *
     * The PRD wants it off by default and wants the CSV and fixture paths to
     * work untouched when it is. There is no live Meta connection to gate, so
     * gating "the payload arm" wholesale would just switch the demo off. What
     * it gates instead is the distinction that actually carries risk: a payload
     * carrying `__mazal_fixture` is one we generated and whose every number is
     * asserted by `pnpm meta:fixtures`, and anything else is a response nobody
     * on this team has ever seen.
     *
     * The adapter has never been run against a real Graph API response — its
     * guard is closed-loop, `packages/meta/src/documented-shape.test.ts` says
     * so — and diagnosing a seller's real campaign through code that has only
     * ever read its own output is the kind of confidence this product exists to
     * refuse. Turn the flag on when someone has checked one.
     */
    const live = !account.fixture;
    if (live && process.env['META_ADS_ENABLED'] !== 'true') {
      throw new MetaInsightsError(
        'META_INSIGHTS_MALFORMED',
        'This payload did not come from our fixtures, and META_ADS_ENABLED is not set. ' +
          'The adapter has never been run against a real Meta response, so it will not diagnose one ' +
          'by default. Set META_ADS_ENABLED=true once a real payload has been checked against it.',
      );
    }

    /**
     * One campaign per call.
     *
     * `diagnose` answers "which stage of this funnel broke first", and three
     * campaigns summed are three funnels averaged into one that belongs to
     * nobody — a leak in one is diluted by the two that are fine. The adapter
     * warns about this; here it is refused, because a tool that returns a
     * confident `Diagnosis` has no way to make the caller read the warning.
     */
    const campaigns = new Set(account.entities.map((e) => e.days[0]?.campaignId ?? e.id));
    if (campaigns.size > 1) {
      throw new MetaInsightsError(
        'META_INSIGHTS_MALFORMED',
        `This payload holds ${campaigns.size} campaigns. diagnose_campaign answers about one funnel — ` +
          'send one campaign per call, or the leak in one is averaged away by the others.',
      );
    }

    days = account.total;
    notes.push(...account.warnings);

    /**
     * The row cap is not the day cap. A payload broken out by ad set carries
     * several rows per day, so 5000 rows can fold into more days than the
     * `days` arm is allowed to send — and then the same limit means two
     * different things depending on which door you came through.
     */
    if (days.length > MAX_DAYS) {
      throw new MetaInsightsError(
        'META_INSIGHTS_MALFORMED',
        `This payload folds into ${days.length} days and the limit is ${MAX_DAYS}. Narrow the date range.`,
      );
    }
  }

  if (days.length === 0) {
    throw new MetaInsightsError('META_INSIGHTS_MALFORMED', 'No usable days in the payload.');
  }

  return {
    diagnosis: diagnose({ days, card: parsed.card, events: parsed.events, reference }),
    notes,
  };
}

/**
 * Two ways in, one engine.
 *
 * A caller that already has `CampaignDay[]` — from a CSV upload, from a
 * fixture — sends them. A caller holding a raw Meta insights response sends
 * that instead, and `@mazal/meta` is what turns it into days. There is no third
 * way, and in particular the agent does not get to map Meta's fields onto ours
 * itself: numbers that arrive that way come from arithmetic nothing in this
 * repo tests.
 */
export function diagnoseCampaign(input: unknown): Diagnosis {
  return diagnoseCampaignWithNotes(input).diagnosis;
}

/**
 * Injected so the tests never open a socket. Production passes nothing.
 */
export type MetaDeps = {
  connect?: (options: { config: ReturnType<typeof readMetaMcpConfig> }) => Promise<MetaMcpClient>;
  env?: NodeJS.ProcessEnv;
};

/**
 * The three doors, and the one engine behind them.
 *
 * `days` and `metaInsights` are unchanged and stay synchronous. `metaQuery`
 * fetches from Meta and then **becomes** the `metaInsights` arm — same adapter,
 * same guards, same engine call. There is no second normalisation path, which
 * is the point: a live account and an uploaded payload cannot disagree about
 * what a day is.
 */
export async function diagnoseCampaignWithNotesAsync(
  input: unknown,
  deps: MetaDeps = {},
): Promise<DiagnoseCampaignResult> {
  const parsed = diagnoseCampaignInputSchema.parse(input);
  if (!parsed.metaQuery) return diagnoseCampaignWithNotes(input);

  const env = deps.env ?? process.env;

  // Checked before anything is opened. An off switch that only takes effect
  // after a credential has been used is not an off switch.
  if (!isMetaAdsEnabled(env)) {
    throw new MetaMcpError(
      'META_MCP_DISABLED',
      'META_ADS_ENABLED is not set, so this server will not read a live Meta ad account. ' +
        'Upload a CSV export or send `metaInsights` instead.',
    );
  }

  const config = readMetaMcpConfig(env);
  const connect = deps.connect ?? connectMetaMcp;
  const client = await connect({ config });

  let metaInsights;
  let signalEvents: StoreEvent[];
  try {
    metaInsights = await fetchInsights(client, parsed.metaQuery);
    signalEvents = await fetchSignalEvents(client, parsed.metaQuery);
  } finally {
    // The credential's session ends with the request that authorised it,
    // whether or not the request succeeded.
    await client.close();
  }

  const result = diagnoseCampaignWithNotes({
    metaInsights,
    card: parsed.card,
    events: [...parsed.events, ...signalEvents],
    reference: parsed.reference,
  });

  return {
    diagnosis: result.diagnosis,
    notes: [
      `Read from a live Meta ad account (campaign ${parsed.metaQuery.campaignId}, ` +
        `${parsed.metaQuery.since} to ${parsed.metaQuery.until}).`,
      ...signalEvents.map((event) => `${event.detail} (${event.date})`),
      ...result.notes,
    ],
  };
}

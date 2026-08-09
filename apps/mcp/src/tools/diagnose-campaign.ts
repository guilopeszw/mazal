import { benchmarks } from '@mazal/data';
import { diagnose } from '@mazal/engine';
import { fromMetaInsights } from '@mazal/meta';
import type { CampaignDay, Diagnosis, ReferenceMode } from '@mazal/contracts';

import { diagnoseCampaignInputSchema } from '../schemas.js';

/**
 * Two ways in, one engine.
 *
 * A caller that already has `CampaignDay[]` — from a CSV upload, from a
 * fixture — sends them. A caller holding a raw Meta insights response sends
 * that instead, and `@mazal/meta` is what turns it into days. There is no third
 * way, and in particular the agent does not get to map Meta's fields onto ours
 * itself: numbers that arrive that way come from arithmetic nothing in this
 * repo tests.
 *
 * `fromMetaInsights` throws `MetaInsightsError` on a payload with a hole in it
 * rather than reading the hole as a zero. The tool wrapper turns that into a
 * tool error with the missing fields named, which is a better answer than a
 * confident diagnosis of a campaign we could not fully read.
 */
export function diagnoseCampaign(input: unknown): Diagnosis {
  const parsed = diagnoseCampaignInputSchema.parse(input);
  const reference: ReferenceMode = parsed.reference.kind === 'benchmark'
    ? { kind: 'benchmark', table: benchmarks }
    : parsed.reference;

  const days: CampaignDay[] = parsed.days ?? fromMetaInsights(parsed.metaInsights).total;

  return diagnose({
    days,
    card: parsed.card,
    events: parsed.events,
    reference,
  });
}

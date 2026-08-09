import { benchmarks } from '@mazal/data';
import { diagnose } from '@mazal/engine';
import type { Diagnosis, ReferenceMode } from '@mazal/contracts';

import { diagnoseCampaignInputSchema } from '../schemas.js';

export function diagnoseCampaign(input: unknown): Diagnosis {
  const parsed = diagnoseCampaignInputSchema.parse(input);
  const reference: ReferenceMode = parsed.reference.kind === 'benchmark'
    ? { kind: 'benchmark', table: benchmarks }
    : parsed.reference;

  return diagnose({
    days: parsed.days,
    card: parsed.card,
    events: parsed.events,
    reference,
  });
}

import { benchmarks } from '@mazal/data';
import { predict } from '@mazal/engine';
import type { Verdict } from '@mazal/contracts';

import { predictCampaignInputSchema } from '../schemas.js';

export function predictCampaign(input: unknown): Verdict {
  const parsed = predictCampaignInputSchema.parse(input);
  return predict({ ...parsed, table: benchmarks });
}

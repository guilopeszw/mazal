import { buildPlan } from '@mazal/engine';
import type { RecoveryPlan } from '@mazal/contracts';

import { buildRecoveryPlanInputSchema } from '../schemas.js';

export function buildRecoveryPlan(input: unknown): RecoveryPlan {
  const { diagnosis, card } = buildRecoveryPlanInputSchema.parse(input);
  return buildPlan(diagnosis, card);
}

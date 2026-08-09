import type { Action } from '@mazal/contracts';

import type { ActionLog } from '../action-log.js';
import { createReceipt } from '../receipt.js';
import { executePlanInputSchema } from '../schemas.js';

export type ExecutePlanResult = {
  receipt: string;
  logged: Action[];
};

export function executePlan(input: unknown, log: ActionLog): ExecutePlanResult {
  const { actions } = executePlanInputSchema.parse(input);

  if (actions.some((action) => action.actor === 'seller')) {
    throw new Error('execute_plan only accepts actions with actor "mazal"');
  }

  const logged = log.append(actions);
  return { receipt: createReceipt(actions), logged };
}

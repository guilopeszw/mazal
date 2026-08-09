import type { McpServer } from '@modelcontextprotocol/server';

import { InMemoryActionLog, type ActionLog } from '../action-log.js';
import {
  buildRecoveryPlanInputSchema,
  diagnoseCampaignInputSchema,
  executePlanInputSchema,
  predictCampaignInputSchema,
} from '../schemas.js';
import { buildRecoveryPlan } from './build-recovery-plan.js';
import { diagnoseCampaign } from './diagnose-campaign.js';
import { executePlan } from './execute-plan.js';
import { predictCampaign } from './predict-campaign.js';

export const MAZAL_TOOL_NAMES = [
  'diagnose_campaign',
  'predict_campaign',
  'build_recovery_plan',
  'execute_plan',
] as const;

const defaultActionLog = new InMemoryActionLog();

function jsonResult(value: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function registerMazalTools(
  server: McpServer,
  actionLog: ActionLog = defaultActionLog,
): void {
  server.registerTool(
    'diagnose_campaign',
    {
      description: 'Diagnose the earliest broken campaign funnel stage.',
      inputSchema: diagnoseCampaignInputSchema,
    },
    (input) => jsonResult(diagnoseCampaign(input)),
  );

  server.registerTool(
    'predict_campaign',
    {
      description: 'Predict a deterministic launch verdict from server benchmarks.',
      inputSchema: predictCampaignInputSchema,
    },
    (input) => jsonResult(predictCampaign(input)),
  );

  server.registerTool(
    'build_recovery_plan',
    {
      description: 'Build a recovery plan directly from a validated diagnosis.',
      inputSchema: buildRecoveryPlanInputSchema,
    },
    (input) => jsonResult(buildRecoveryPlan(input)),
  );

  server.registerTool(
    'execute_plan',
    {
      description: 'Simulate approved Mazal actions and return a deterministic receipt.',
      inputSchema: executePlanInputSchema,
    },
    (input) => jsonResult(executePlan(input, actionLog)),
  );
}

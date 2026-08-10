import type { McpServer } from '@modelcontextprotocol/server';

import { InMemoryActionLog, type ActionLog } from '../action-log.js';
import {
  buildRecoveryPlanInputSchema,
  diagnoseCampaignInputSchema,
  executePlanInputSchema,
  predictCampaignInputSchema,
} from '../schemas.js';
import { buildRecoveryPlan } from './build-recovery-plan.js';
import { diagnoseCampaignWithNotes } from './diagnose-campaign.js';
import { executePlan } from './execute-plan.js';
import { predictCampaign } from './predict-campaign.js';

export const MAZAL_TOOL_NAMES = [
  'diagnose_campaign',
  'predict_campaign',
  'build_recovery_plan',
  'execute_plan',
] as const;

/**
 * `notes` ride alongside the answer rather than inside it.
 *
 * `structuredContent` stays exactly the engine's own type — a client reading it
 * gets a `Diagnosis` and nothing else. What the adapter had to say about the
 * payload it read (this is a fixture, the reach is an upper bound, there was a
 * second page) goes in a second text block, because an agent that cannot see
 * those will present a half-read campaign as a whole one.
 */
function jsonResult(value: object, notes: string[] = []) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(value) },
      ...(notes.length > 0
        ? [{ type: 'text' as const, text: `Provenance of this data:\n- ${notes.join('\n- ')}` }]
        : []),
    ],
    structuredContent: value as Record<string, unknown>,
  };
}

export function registerMazalTools(
  server: McpServer,
  actionLog: ActionLog = new InMemoryActionLog(),
): void {
  server.registerTool(
    'diagnose_campaign',
    {
      // The exactly-one rule cannot be expressed in JSON Schema, so both fields
      // publish as plain optionals and a client author would otherwise meet the
      // rule as a runtime error. It is said here instead.
      description:
        'Diagnose the earliest broken campaign funnel stage. Send either `days` (CampaignDay[]) ' +
        'or `metaInsights` (a raw Meta /insights response, one campaign per call) — exactly one of ' +
        'the two, never both. Do not convert a Meta payload into days yourself.',
      inputSchema: diagnoseCampaignInputSchema,
    },
    (input) => {
      const { diagnosis, notes } = diagnoseCampaignWithNotes(input);
      return jsonResult(diagnosis, notes);
    },
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

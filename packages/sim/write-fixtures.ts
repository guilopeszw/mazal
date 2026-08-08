// ─── packages/sim/write-fixtures.ts ──────────────────────────────────────
// Runnable: pnpm sim:fixtures. Output is committed and never hand-edited.
//
// Case 1 is a condition — present from day one, and only a benchmark catches
// it. Case 2 is a break — it starts mid-flight, and the campaign's own history
// catches it. One of each, because they are what put both ReferenceMode arms
// on screen, and the demo's two cases are meant to be different stories.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateCampaign } from './index.ts';

const CASES = [
  { file: 'demo-case1.json', seed: 20260809, fault: 'thin_pdp' as const },
  { file: 'demo-case2.json', seed: 20260810, fault: 'eta_shock' as const },
];

for (const c of CASES) {
  const campaign = generateCampaign(c.seed, c.fault);
  writeFileSync(
    join(import.meta.dirname, 'fixtures', c.file),
    `${JSON.stringify(campaign, null, 2)}\n`,
  );
  console.log(
    `${c.file}  seed ${c.seed}  ${c.fault.padEnd(10)} ${campaign.card.category.padEnd(30)}` +
      ` ${campaign.days.length} days  ${campaign.events.length} events` +
      `${campaign.fault.injectedOn ? `  injected ${campaign.fault.injectedOn}` : '  (from day one)'}`,
  );
}

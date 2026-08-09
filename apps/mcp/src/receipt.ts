import { createHash } from 'node:crypto';

import type { Action } from '@mazal/contracts';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(',')}}`;
}

export function createReceipt(actions: readonly Action[]): string {
  const canonicalActions = actions.map(canonicalJson).sort();
  const payload = `[${canonicalActions.join(',')}]`;
  return createHash('sha256').update(payload).digest('hex');
}

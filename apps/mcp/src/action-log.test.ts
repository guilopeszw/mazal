import { expect, test } from 'vitest';

import { InMemoryActionLog } from './action-log.js';
import { mazalAction } from './tools/test-fixtures.js';

test('appends actions and returns the entries logged by this call', () => {
  const log = new InMemoryActionLog();
  const second = { ...mazalAction, id: 'budget_cap.0', title: 'Raise the bid cap' };

  expect(log.append([mazalAction])).toEqual([mazalAction]);
  expect(log.append([second])).toEqual([second]);
  expect(log.snapshot()).toEqual([mazalAction, second]);
});

test('keeps an immutable snapshot of appended actions', () => {
  const log = new InMemoryActionLog();
  const input = { ...mazalAction };

  const logged = log.append([input]);
  input.title = 'Mutated input';
  logged[0]!.title = 'Mutated return value';

  expect(log.snapshot()).toEqual([mazalAction]);
});

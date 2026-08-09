import { expect, test } from 'vitest';

import { createReceipt } from './receipt.js';
import { mazalAction } from './tools/test-fixtures.js';

test('hashes canonical actions into a stable receipt', () => {
  expect(createReceipt([mazalAction])).toBe(
    '381e19127b7a4287ea6381debcd8e2cfc89e007e8c714f21648f096bd13a0bd4',
  );
});

test('treats the same action set as canonical regardless of input order', () => {
  const second = { ...mazalAction, id: 'budget_cap.0', title: 'Raise the bid cap' };

  expect(createReceipt([mazalAction, second])).toBe(createReceipt([second, mazalAction]));
});

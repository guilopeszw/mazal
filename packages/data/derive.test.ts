import { expect, test } from 'vitest';
import { parseCsv, distribution } from './derive.ts';

test('reads a quoted field containing a comma and a newline as one value', () => {
  const csv = 'review_id,order_id,review_comment_message\r\nr1,o1,"chegou rapido, mas\nveio amassado"\r\n';

  const rows = parseCsv(csv);

  expect(rows).toHaveLength(1);
  expect(rows[0]!['review_comment_message']).toBe('chegou rapido, mas\nveio amassado');
  expect(rows[0]!['order_id']).toBe('o1');
});

test('reads a doubled quote as one literal quote', () => {
  const rows = parseCsv('a,b\n1,"say ""hi"""\n');

  expect(rows[0]!['b']).toBe('say "hi"');
});

test('strips a BOM instead of hiding it inside the first column name', () => {
  const rows = parseCsv('﻿product_category_name,product_category_name_english\nbeleza_saude,health_beauty\n');

  expect(rows[0]!['product_category_name']).toBe('beleza_saude');
});

test('quartiles interpolate and carry the row count behind them', () => {
  const d = distribution([1, 2, 3, 4, 5, 6, 7, 8, 9], 'olist');

  expect(d.median).toBe(5);
  expect(d.p25).toBe(3);
  expect(d.p75).toBe(7);
  expect(d.n).toBe(9);
  expect(d.source).toBe('olist');
});

test('drops non-numeric values instead of counting them as zero', () => {
  const d = distribution([10, NaN, 20, NaN, 30], 'olist');

  expect(d.n).toBe(3);
  expect(d.median).toBe(20);
});

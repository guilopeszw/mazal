import { timingSafeEqual } from 'node:crypto';

export function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !authorization?.startsWith('Bearer ')) return false;

  const token = authorization.slice('Bearer '.length);
  const actual = Buffer.from(token);
  const expected = Buffer.from(expectedToken);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

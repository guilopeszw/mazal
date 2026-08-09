import { createHash, timingSafeEqual } from 'node:crypto';

function digestToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !authorization?.startsWith('Bearer ')) return false;

  const token = authorization.slice('Bearer '.length);
  const actual = digestToken(token);
  const expected = digestToken(expectedToken);

  return timingSafeEqual(actual, expected);
}

import { randomBytes } from "node:crypto";

/**
 * Temporary server-only handle. Task 4 will bind it to a signed cookie and expiry;
 * this function intentionally accepts no external identifier or provider thread id.
 */
export function issueConversationId(): string {
  return randomBytes(32).toString("base64url");
}

// ─── apps/mcp/src/meta-client/errors.ts ──────────────────────────────────
// Failures of the connection to Meta, which are a different kind of thing
// from failures of the payload it returns.
//
// `@mazal/meta` owns `MetaInsightsError`: the response arrived and something
// about it could not be read. These are the ones where the response did not
// arrive, arrived from a tool we refuse to call, or arrived in a form that is
// not data at all. Keeping them apart means a seller-facing message can say
// "Meta did not answer" rather than "your campaign data is malformed".

export type MetaMcpErrorCode =
  /** `META_ADS_ENABLED` is not `true`. The live arm is off. */
  | 'META_MCP_DISABLED'
  /** No token, no url, or a url we will not send a bearer token to. */
  | 'META_MCP_NOT_CONFIGURED'
  /** Something asked for a tool outside the read-only allowlist. */
  | 'META_MCP_TOOL_NOT_ALLOWED'
  /** The session could not be opened, the call timed out, or the socket died. */
  | 'META_MCP_TRANSPORT'
  /** Meta rejected the credential. */
  | 'META_MCP_AUTH'
  /** The tool answered, and the answer was not structured data. */
  | 'META_MCP_UNREADABLE'
  /** More pages than the cap. Half a campaign is worse than no campaign. */
  | 'META_MCP_TOO_MANY_PAGES'
  /** The account bills in a currency our benchmarks are not denominated in. */
  | 'META_MCP_CURRENCY';

export class MetaMcpError extends Error {
  readonly code: MetaMcpErrorCode;

  constructor(code: MetaMcpErrorCode, message: string) {
    super(message);
    this.name = 'MetaMcpError';
    this.code = code;
  }
}

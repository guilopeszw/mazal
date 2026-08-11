// ─── apps/mcp/src/meta-client/index.ts ───────────────────────────────────
// The only surface `tools/` imports from this module.

export { META_TOOLS, META_TOOL_ALLOWLIST, assertToolAllowed } from './allowlist.js';
export { connectMetaMcp, unwrapToolResult, type ConnectOptions, type MetaMcpClient } from './client.js';
export { isMetaAdsEnabled, readMetaMcpConfig, type MetaMcpConfig } from './config.js';
export { MetaMcpError, type MetaMcpErrorCode } from './errors.js';
export { fetchInsights, MAX_PAGES, type MetaQuery } from './insights.js';
export { fetchSignalEvents } from './signal.js';

// ─── apps/mcp/src/meta-client/config.ts ──────────────────────────────────
// The only place in the product that reads the Meta connection's environment.

import { MetaMcpError } from './errors.js';

export type MetaMcpConfig = {
  url: string;
  token: string;
};

const DEFAULT_URL = 'https://mcp.facebook.com/ads';

/**
 * Off unless the environment says exactly `true`.
 *
 * Not `!== 'false'`, not a truthiness check: `META_ADS_ENABLED=0` and
 * `META_ADS_ENABLED=no` both read as "off" to whoever typed them, and a flag
 * that guards live seller data does not get to interpret intent generously.
 */
export function isMetaAdsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['META_ADS_ENABLED'] === 'true';
}

export function readMetaMcpConfig(env: NodeJS.ProcessEnv = process.env): MetaMcpConfig {
  const token = env['MAZAL_META_MCP_TOKEN']?.trim();
  if (!token) {
    throw new MetaMcpError(
      'META_MCP_NOT_CONFIGURED',
      'MAZAL_META_MCP_TOKEN is not set. Authorise the ad account in a browser and set the ' +
        'token as a server-only secret; it is never read from a tool argument.',
    );
  }

  const url = env['MAZAL_META_MCP_URL']?.trim() || DEFAULT_URL;
  // The token rides in an Authorization header, so the transport carrying it
  // has to be encrypted. A misconfigured url is the cheapest possible way to
  // hand a live advertiser credential to whoever is on the wire.
  if (!url.startsWith('https://')) {
    throw new MetaMcpError(
      'META_MCP_NOT_CONFIGURED',
      `MAZAL_META_MCP_URL must be https — refusing to send a bearer token over ${url.split(':')[0]}.`,
    );
  }

  return { url, token };
}

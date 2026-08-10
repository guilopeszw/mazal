import { describe, expect, test } from 'vitest';

import { isMetaAdsEnabled, readMetaMcpConfig } from './config.js';
import { MetaMcpError } from './errors.js';

describe('readMetaMcpConfig', () => {
  test('reads the url and token from the environment', () => {
    expect(readMetaMcpConfig({
      MAZAL_META_MCP_URL: 'https://example.test/ads',
      MAZAL_META_MCP_TOKEN: 'secret-token',
    })).toEqual({ url: 'https://example.test/ads', token: 'secret-token' });
  });

  test('defaults the url to Meta production when only a token is set', () => {
    expect(readMetaMcpConfig({ MAZAL_META_MCP_TOKEN: 't' }).url)
      .toBe('https://mcp.facebook.com/ads');
  });

  test('refuses when the token is missing, and does not invent one', () => {
    expect(() => readMetaMcpConfig({})).toThrow(MetaMcpError);
    expect(() => readMetaMcpConfig({})).toThrow(/MAZAL_META_MCP_TOKEN/);
  });

  test('never puts the token in the error message', () => {
    // A blank token is still a configuration error, and the message that
    // reports it is the likeliest place for a secret to leak into a log.
    try {
      readMetaMcpConfig({ MAZAL_META_MCP_TOKEN: '   ' });
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as MetaMcpError).code).toBe('META_MCP_NOT_CONFIGURED');
      expect((error as Error).message).not.toContain('   ');
    }
  });

  test('refuses a non-https url', () => {
    expect(() => readMetaMcpConfig({
      MAZAL_META_MCP_URL: 'http://example.test/ads',
      MAZAL_META_MCP_TOKEN: 't',
    })).toThrow(/https/);
  });
});

describe('isMetaAdsEnabled', () => {
  test('is off when unset', () => {
    expect(isMetaAdsEnabled({})).toBe(false);
  });

  test('is on only for the exact string "true"', () => {
    expect(isMetaAdsEnabled({ META_ADS_ENABLED: 'true' })).toBe(true);
    expect(isMetaAdsEnabled({ META_ADS_ENABLED: 'TRUE' })).toBe(false);
    expect(isMetaAdsEnabled({ META_ADS_ENABLED: '1' })).toBe(false);
    expect(isMetaAdsEnabled({ META_ADS_ENABLED: 'yes' })).toBe(false);
  });
});

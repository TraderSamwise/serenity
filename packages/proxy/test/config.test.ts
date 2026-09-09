import { describe, expect, it } from 'vitest'
import { loadProxyConfig } from '../src/config'

describe('proxy config', () => {
  it('names missing Upstash credentials in the project env file', () => {
    expect(() =>
      loadProxyConfig({
        SERENITY_OPENAI_API_KEY: 'openai-key',
        SERENITY_PROXY_TOKEN_SECRET: 'token-secret',
      }),
    ).toThrow(
      'Missing proxy environment variables or Worker secrets: SERENITY_UPSTASH_REDIS_REST_URL, SERENITY_UPSTASH_REDIS_REST_TOKEN. Set them with wrangler secret put for Workers or packages/proxy/.env.local for local tools.',
    )
  })

  it('loads Upstash-backed production storage config from product-prefixed env', () => {
    expect(
      loadProxyConfig({
        SERENITY_OPENAI_API_KEY: 'openai-key',
        SERENITY_PROXY_TOKEN_SECRET: 'token-secret',
        SERENITY_UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
        SERENITY_UPSTASH_REDIS_REST_TOKEN: 'redis-token',
        SERENITY_PROXY_PER_INSTALL_TIER2_QUOTA: '25',
        SERENITY_PROXY_GLOBAL_TIER2_CEILING: '100',
        SERENITY_PROXY_GLOBAL_TOKEN_CEILING: '5000',
        SERENITY_PROXY_REGISTER_PER_IP_QUOTA: '12',
      }),
    ).toMatchObject({
      apiKey: 'openai-key',
      tokenSecret: 'token-secret',
      upstashRedisRestUrl: 'https://example.upstash.io',
      upstashRedisRestToken: 'redis-token',
      perInstallTier2Quota: 25,
      globalTier2Ceiling: 100,
      globalTokenCeiling: 5000,
      registerPerIpQuota: 12,
    })
  })
})

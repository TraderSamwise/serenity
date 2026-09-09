import { describe, expect, it } from 'vitest'
import { createWorkerFetchHandler } from '../src/worker'
import { createProxyApp } from '../src/http'
import { issueInstallToken } from '../src/token'
import { MemoryGlobalHashCache } from '../src/hash-cache'
import { MemoryQuotaStore } from '../src/quota'
import { MemoryRegisterLimiter } from '../src/register-limit'
import { classification, moderation } from './helpers'

const secret = 'proxy-secret'
const installId = '123e4567-e89b-12d3-a456-426614174000'

describe('Worker fetch handler', () => {
  it('adapts Workers fetch requests to the proxy app', async () => {
    const worker = createWorkerFetchHandler(() =>
      createProxyApp({
        tokenSecret: secret,
        deps: {
          cache: new MemoryGlobalHashCache(),
          quota: new MemoryQuotaStore({
            perInstallTier2Quota: 10,
            globalTier2Ceiling: 10,
            globalTokenCeiling: 10000,
            tier2Enabled: true,
          }),
          tier1: {
            async moderate() {
              return moderation({})
            },
          },
          tier2: {
            async classify() {
              return {
                classification: classification({ insult: 0.2 }),
                usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
              }
            },
          },
        },
        registerLimiter: new MemoryRegisterLimiter(10),
      }),
    )
    const response = await worker.fetch(
      new Request('https://serenity-proxy.example/classify', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${issueInstallToken(installId, { secret })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: ['one'] }),
      }),
      {},
    )
    const body = await response.json() as { results: unknown[] }

    expect(response.status).toBe(200)
    expect(body.results).toHaveLength(1)
  })

  it('returns a CORS-visible configuration error when required Worker secrets are absent', async () => {
    const response = await createWorkerFetchHandler().fetch(
      new Request('https://serenity-proxy.example/classify', { method: 'OPTIONS' }),
      {},
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toEqual({
      error:
        'Missing proxy environment variables or Worker secrets: SERENITY_OPENAI_API_KEY, SERENITY_PROXY_TOKEN_SECRET, SERENITY_UPSTASH_REDIS_REST_URL, SERENITY_UPSTASH_REDIS_REST_TOKEN. Set them with wrangler secret put for Workers or packages/proxy/.env.local for local tools.',
    })
  })
})

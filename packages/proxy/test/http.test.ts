import { describe, expect, it } from 'vitest'
import { createProxyApp } from '../src/http'
import { issueInstallToken } from '../src/token'
import { MemoryGlobalHashCache } from '../src/hash-cache'
import { MemoryQuotaStore } from '../src/quota'
import { classification, moderation } from './helpers'

const secret = 'proxy-secret'
const installId = '123e4567-e89b-12d3-a456-426614174000'

function request(body: unknown, token = issueInstallToken(installId, { secret })) {
  return new Request('http://localhost/classify', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function app() {
  return createProxyApp({
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
  })
}

describe('POST /classify', () => {
  it('returns a vector per message and does not accept settings fields', async () => {
    const ok = await app().fetch(request({ messages: ['one', 'two'] }))
    const body = await ok.json() as { results: unknown[] }

    expect(ok.status).toBe(200)
    expect(body.results).toHaveLength(2)
    expect(body.results[0]).toMatchObject({ status: 'classified' })
    expect(body).not.toHaveProperty('stats')
    expect(body).not.toHaveProperty('classifications')

    const rejected = await app().fetch(
      request({ messages: ['one'], preset: 'balanced' }),
    )
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ error: 'Unsupported request field.' })
  })

  it('requires a valid signed install token', async () => {
    const missing = await app().fetch(
      new Request('http://localhost/classify', {
        method: 'POST',
        body: JSON.stringify({ messages: ['one'] }),
      }),
    )
    const wrong = await app().fetch(request({ messages: ['one'] }, 'bad-token'))

    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
  })

  it('handles extension preflight for the authenticated classify request', async () => {
    const response = await app().fetch(
      new Request('http://localhost/classify', { method: 'OPTIONS' }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('keeps classify stats internal to the proxy', async () => {
    const response = await app().fetch(request({ messages: ['one'] }))
    const body = await response.json() as Record<string, unknown>

    expect(body).not.toHaveProperty('stats')
  })
})

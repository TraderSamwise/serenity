import { describe, expect, it } from 'vitest'
import { createProxyApp } from '../src/http'
import { issueInstallToken, verifyInstallToken } from '../src/token'
import { MemoryGlobalHashCache } from '../src/hash-cache'
import { MemoryQuotaStore } from '../src/quota'
import { MemoryRegisterLimiter } from '../src/register-limit'
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
    registerLimiter: new MemoryRegisterLimiter(10),
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

describe('POST /register', () => {
  it('issues a token bound to a valid install UUID without authentication', async () => {
    const response = await app().fetch(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId }),
      }),
    )
    const body = await response.json() as { token: string }

    expect(response.status).toBe(200)
    expect(verifyInstallToken(body.token, secret)).toBe(installId)
  })

  it('rejects invalid install ids and unsupported fields', async () => {
    const invalid = await app().fetch(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId: 'not-a-uuid' }),
      }),
    )
    const extra = await app().fetch(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installId, preset: 'aggressive' }),
      }),
    )

    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'installId must be a UUID.' })
    expect(extra.status).toBe(400)
    expect(await extra.json()).toEqual({ error: 'Unsupported request field.' })
  })

  it('rate-limits unauthenticated token minting by IP', async () => {
    const limited = createProxyApp({
      tokenSecret: secret,
      deps: {
        cache: new MemoryGlobalHashCache(),
        quota: new MemoryQuotaStore({
          perInstallTier2Quota: 10,
          globalTier2Ceiling: 10,
          globalTokenCeiling: 10000,
          tier2Enabled: true,
        }),
        tier1: { async moderate() { return moderation({}) } },
        tier2: {
          async classify() {
            return {
              classification: classification({ insult: 0.2 }),
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            }
          },
        },
      },
      registerLimiter: new MemoryRegisterLimiter(1),
    })
    const registerRequest = () =>
      new Request('http://localhost/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.10',
        },
        body: JSON.stringify({ installId }),
      })

    expect((await limited.fetch(registerRequest())).status).toBe(200)
    const denied = await limited.fetch(registerRequest())
    expect(denied.status).toBe(429)
    expect(await denied.json()).toEqual({ error: 'Registration rate limit exceeded.' })
  })
})

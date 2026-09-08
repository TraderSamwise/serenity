import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

async function appWithStatsPath(statsPath: string) {
  return createProxyApp({
    tokenSecret: secret,
    statsPath,
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
            usage: {
              input_tokens: 100,
              input_tokens_details: { cached_tokens: 80 },
              output_tokens: 12,
              total_tokens: 112,
            },
          }
        },
      },
    },
  })
}

describe('POST /classify', () => {
  it('returns a vector per message and does not accept settings fields', async () => {
    const ok = await app().fetch(request({ messages: ['one', 'two'] }))
    const body = await ok.json() as { classifications: unknown[] }

    expect(ok.status).toBe(200)
    expect(body.classifications).toHaveLength(2)
    expect(body).not.toHaveProperty('stats')

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

  it('can append count-only classify stats without exposing them in the response', async () => {
    const statsPath = join(await mkdtemp(join(tmpdir(), 'serenity-proxy-stats-')), 'stats.jsonl')
    const response = await (await appWithStatsPath(statsPath)).fetch(request({ messages: ['one'] }))
    const body = await response.json() as Record<string, unknown>
    const stats = JSON.parse(await readFile(statsPath, 'utf8')) as {
      messages: number
      tier2Classifications: number
      usage: { cachedInputTokens: number }
    }

    expect(body).not.toHaveProperty('stats')
    expect(stats.messages).toBe(1)
    expect(stats.tier2Classifications).toBe(1)
    expect(stats.usage.cachedInputTokens).toBe(80)
  })
})

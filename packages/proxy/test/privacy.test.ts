import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProxyApp } from '../src/http'
import { FileGlobalHashCache, textHash } from '../src/hash-cache'
import { FileQuotaStore } from '../src/quota'
import { issueInstallToken } from '../src/token'
import { classification, moderation } from './helpers'

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('plaintext privacy', () => {
  it('does not write request message plaintext to persisted artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serenity-proxy-'))
    tempDirs.push(dir)
    const secret = 'proxy-secret'
    const installId = '123e4567-e89b-12d3-a456-426614174000'
    const knownPlaintext = 'Known private request body string 9f4c2a'
    const app = createProxyApp({
      tokenSecret: secret,
      deps: {
        cache: new FileGlobalHashCache(join(dir, 'cache/global-cache.v1.json')),
        quota: new FileQuotaStore(join(dir, 'quota/quota.v1.json'), {
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

    const response = await app.fetch(
      new Request('http://localhost/classify', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${issueInstallToken(installId, { secret })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: [knownPlaintext] }),
      }),
    )

    expect(response.status).toBe(200)
    const persisted = await readPersistedText(dir)
    expect(persisted).not.toContain(knownPlaintext)
    expect(persisted).toContain(textHash(knownPlaintext))

    const cache = JSON.parse(
      await readFile(join(dir, 'cache/global-cache.v1.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(Object.keys(cache)).toEqual([textHash(knownPlaintext)])
  })
})

async function readPersistedText(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const fileContents = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => readFile(join(entry.parentPath, entry.name), 'utf8')),
  )
  return fileContents.join('\n')
}

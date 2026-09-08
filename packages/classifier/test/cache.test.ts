import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { HARM_AXES, PROTECTIVE_AXES, SCHEMA_VERSION } from '../../core/src/index'
import type { Classification, ScoredAxis } from '../../core/src/index'
import {
  classifyMissingCorpusEntries,
  emptyClassificationCache,
  loadClassificationCache,
  saveClassificationCache,
} from '../src/cache'
import { cacheKeyForText } from '../src/hash'
import { CLASSIFIER_MODEL } from '../src/schema'

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

function classification(score = 0): Classification {
  const scores = Object.fromEntries(
    [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, score]),
  ) as Record<ScoredAxis, number>

  return {
    model: CLASSIFIER_MODEL,
    schema: SCHEMA_VERSION,
    sentiment: 0,
    targeted: 0,
    confidence: 1,
    scores,
  }
}

async function tempCachePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'serenity-classifier-'))
  tempDirs.push(dir)
  return join(dir, 'classification-cache.v1.json')
}

describe('classification cache', () => {
  it('loads an empty cache when the file does not exist', async () => {
    const cache = await loadClassificationCache(await tempCachePath())

    expect(cache).toEqual(emptyClassificationCache())
  })

  it('saves cache JSON atomically enough for replay consumers', async () => {
    const path = await tempCachePath()
    const cache = emptyClassificationCache()
    cache.entries[cacheKeyForText('Hello')] = classification()

    await saveClassificationCache(path, cache)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(cache)
  })

  it('skips existing keys and persists after each new classification', async () => {
    const path = await tempCachePath()
    const existing = emptyClassificationCache()
    existing.entries[cacheKeyForText('Already cached')] = classification(0.1)
    await saveClassificationCache(path, existing)

    const cache = await loadClassificationCache(path)
    const result = await classifyMissingCorpusEntries(
      [
        { id: 'cached-001', text: 'Already cached', tags: [] },
        { id: 'new-001', text: 'Needs classification', tags: [] },
      ],
      cache,
      path,
      async () => classification(0.2),
    )

    const stored = JSON.parse(await readFile(path, 'utf8')) as typeof cache
    expect(result).toEqual({ classified: 1, skipped: 1 })
    expect(Object.keys(stored.entries)).toHaveLength(2)
    expect(stored.entries[cacheKeyForText('Already cached')]).toEqual(classification(0.1))
    expect(stored.entries[cacheKeyForText('Needs classification')]).toEqual(classification(0.2))
  })
})

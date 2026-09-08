import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { HARM_AXES, PROTECTIVE_AXES, SCHEMA_VERSION } from '@serenity/core'
import type { Classification, ScoredAxis } from '@serenity/core'
import {
  classifyMissingCorpusEntries,
  emptyClassificationCache,
  loadClassificationCache,
  saveClassificationCache,
} from '../src/cache'
import { cacheKeyForText, fieldCacheKeyForText } from '../src/hash'
import { CLASSIFIER_MODEL, CLASSIFIER_OUTPUT_FIELDS } from '../src/schema'

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
    sentiment: score,
    targeted: score,
    confidence: score,
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
    for (const field of CLASSIFIER_OUTPUT_FIELDS) {
      cache.fieldEntries[fieldCacheKeyForText('Hello', field)] = 0
    }
    cache.entries[cacheKeyForText('Hello')] = classification()

    await saveClassificationCache(path, cache)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(cache)
  })

  it('skips existing keys and persists after each new classification', async () => {
    const path = await tempCachePath()
    const existing = emptyClassificationCache()
    for (const field of CLASSIFIER_OUTPUT_FIELDS) {
      existing.fieldEntries[fieldCacheKeyForText('Already cached', field)] = 0.1
    }
    await saveClassificationCache(path, existing)

    const cache = await loadClassificationCache(path)
    const result = await classifyMissingCorpusEntries(
      [
        { id: 'cached-001', text: 'Already cached', tags: [] },
        { id: 'new-001', text: 'Needs classification', tags: [] },
      ],
      cache,
      path,
      async (_message, fields) => Object.fromEntries(fields.map((field) => [field, 0.2])),
    )

    const stored = JSON.parse(await readFile(path, 'utf8')) as typeof cache
    expect(result).toEqual({ classified: 1, skipped: 1 })
    expect(Object.keys(stored.entries)).toHaveLength(2)
    expect(stored.entries[cacheKeyForText('Already cached')]).toEqual(classification(0.1))
    expect(stored.entries[cacheKeyForText('Needs classification')]).toEqual(classification(0.2))
  })

  it('migrates legacy full-vector caches and reclassifies only stale fields', async () => {
    const path = await tempCachePath()
    const legacy = {
      schemaVersion: SCHEMA_VERSION,
      rubricVersion: 5,
      model: CLASSIFIER_MODEL,
      entries: {
        [cacheKeyForText('Legacy cached', 5)]: classification(0.1),
      },
    }
    await writeFile(path, `${JSON.stringify(legacy)}\n`, 'utf8')

    const cache = await loadClassificationCache(path)
    const seenFields: string[][] = []
    const result = await classifyMissingCorpusEntries(
      [{ id: 'legacy-001', text: 'Legacy cached', tags: [] }],
      cache,
      path,
      async (_message, fields) => {
        seenFields.push([...fields])
        return Object.fromEntries(fields.map((field) => [field, 0.8]))
      },
    )

    const stored = JSON.parse(await readFile(path, 'utf8')) as typeof cache
    expect(result).toEqual({ classified: 1, skipped: 0 })
    expect(seenFields).toEqual([['coercion']])
    expect(stored.entries[cacheKeyForText('Legacy cached')]!.scores.insult).toBe(0.1)
    expect(stored.entries[cacheKeyForText('Legacy cached')]!.scores.coercion).toBe(0.8)
    expect(stored.fieldEntries[fieldCacheKeyForText('Legacy cached', 'insult')]).toBe(0.1)
    expect(stored.fieldEntries[fieldCacheKeyForText('Legacy cached', 'coercion')]).toBe(0.8)
  })
})

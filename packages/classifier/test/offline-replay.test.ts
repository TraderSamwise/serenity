import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRESETS, evaluate } from '@serenity/core'
import { cacheKeyForText } from '../src/hash'
import { loadClassificationCache, readCorpusJsonl } from '../src/cache'

const corpusPath = fileURLToPath(new URL('../fixtures/corpus.jsonl', import.meta.url))
const cachePath = fileURLToPath(
  new URL('../fixtures/classification-cache.v1.json', import.meta.url),
)

describe('offline replay cache', () => {
  it('contains a vector for every committed corpus message', async () => {
    const corpus = await readCorpusJsonl(corpusPath)
    const cache = await loadClassificationCache(cachePath)

    expect(Object.keys(cache.entries)).toHaveLength(corpus.length)
    for (const message of corpus) {
      expect(cache.entries[cacheKeyForText(message.text)]).toBeDefined()
    }
  })

  it('stores raw scores rather than post-threshold verdicts', async () => {
    const cache = await loadClassificationCache(cachePath)
    const [entry] = Object.values(cache.entries)

    expect(entry).toBeDefined()
    expect(entry).toHaveProperty('scores')
    expect(entry).toHaveProperty('sentiment')
    expect(entry).toHaveProperty('targeted')
    expect(entry).toHaveProperty('confidence')
    expect(entry).not.toHaveProperty('hide')
    expect(entry).not.toHaveProperty('reason')
  })

  it('keeps near-miss benign messages visible under the aggressive preset', async () => {
    const corpus = await readCorpusJsonl(corpusPath)
    const cache = await loadClassificationCache(cachePath)
    const nearMisses = corpus.filter((message) => message.tags.includes('near_miss_benign'))

    expect(nearMisses.length).toBeGreaterThan(0)
    for (const message of nearMisses) {
      const classification = cache.entries[cacheKeyForText(message.text)]
      expect(classification, message.id).toBeDefined()
      expect(evaluate(classification!, PRESETS.aggressive), message.id).toMatchObject({
        hide: false,
      })
    }
  })
})

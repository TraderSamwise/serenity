import { describe, expect, it } from 'vitest'
import { PRESETS, evaluate } from '../../core/src/index'
import { cacheKeyForText } from '../src/hash'
import { loadClassificationCache, readCorpusJsonl } from '../src/cache'

describe('offline replay cache', () => {
  it('contains a vector for every committed corpus message', async () => {
    const corpus = await readCorpusJsonl('fixtures/corpus.jsonl')
    const cache = await loadClassificationCache('fixtures/classification-cache.v1.json')

    expect(Object.keys(cache.entries)).toHaveLength(corpus.length)
    for (const message of corpus) {
      expect(cache.entries[cacheKeyForText(message.text)]).toBeDefined()
    }
  })

  it('keeps near-miss benign messages visible under the aggressive preset', async () => {
    const corpus = await readCorpusJsonl('fixtures/corpus.jsonl')
    const cache = await loadClassificationCache('fixtures/classification-cache.v1.json')
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

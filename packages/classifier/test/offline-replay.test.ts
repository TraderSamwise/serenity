import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PRESETS, evaluate } from '@serenity/core'
import { cacheKeyForText } from '../src/hash'
import { loadClassificationCache, readCorpusJsonl } from '../src/cache'
import { expectedVerdictsFromTextLabel, readJsonl } from '../src/labeling'
import type { LabelContext, LabelVerdict, TextOnlyGoldenLabel } from '../src/labeling'

const corpusPath = fileURLToPath(new URL('../fixtures/corpus.jsonl', import.meta.url))
const cachePath = fileURLToPath(
  new URL('../fixtures/classification-cache.v1.json', import.meta.url),
)
const codexV2LabelsPath = fileURLToPath(new URL('../labels/codex.labels.v2.jsonl', import.meta.url))
const overseerV2LabelsPath = fileURLToPath(
  new URL('../labels/overseer.labels.v2.jsonl', import.meta.url),
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

  it('scores cached model verdicts against migrated v2 text labels', async () => {
    const corpus = await readCorpusJsonl(corpusPath)
    const cache = await loadClassificationCache(cachePath)
    const labels = [
      ...(await readJsonl<TextOnlyGoldenLabel>(codexV2LabelsPath)),
      ...(await readJsonl<TextOnlyGoldenLabel>(overseerV2LabelsPath)),
    ]
    const textById = new Map(corpus.map((message) => [message.id, message.text]))
    const mismatches: Array<{ id: string; context: LabelContext; expected: LabelVerdict; actual: LabelVerdict }> = []

    for (const label of labels) {
      const text = textById.get(label.id)
      expect(text, label.id).toBeDefined()
      const classification = cache.entries[cacheKeyForText(text!)]
      expect(classification, label.id).toBeDefined()
      const actual = actualVerdicts(classification!)
      const expected = expectedVerdictsFromTextLabel(label)
      for (const context of Object.keys(expected) as LabelContext[]) {
        if (actual[context] !== expected[context]) {
          mismatches.push({ id: label.id, context, expected: expected[context], actual: actual[context] })
        }
      }
    }

    expect(labels).toHaveLength(60)
    expect(
      mismatches.filter((mismatch) =>
        ['hostile-low-axis-005', 'hostile-low-axis-014'].includes(mismatch.id),
      ),
    ).toEqual([])
  })
})

function actualVerdicts(classification: Parameters<typeof evaluate>[0]): Record<LabelContext, LabelVerdict> {
  return {
    aggressive_standard: evaluate(classification, PRESETS.aggressive).hide ? 'hide' : 'show',
    balanced_standard: evaluate(classification, PRESETS.balanced).hide ? 'hide' : 'show',
    aggressive_nsfw: evaluate(classification, {
      ...PRESETS.aggressive,
      ignore: ['sexual_explicit'],
    }).hide
      ? 'hide'
      : 'show',
  }
}

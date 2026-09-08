import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertLabelsMatchQueue,
  assertScoreHiddenLabels,
  assertScoreHiddenQueue,
  readJsonl,
} from '../src/labeling'
import type { GoldenLabel, LabelQueueEntry } from '../src/labeling'
import { readCorpusJsonl } from '../src/cache'

const corpusPath = fileURLToPath(new URL('../fixtures/corpus.jsonl', import.meta.url))
const codexQueuePath = fileURLToPath(new URL('../labels/codex.queue.v1.jsonl', import.meta.url))
const overseerQueuePath = fileURLToPath(
  new URL('../labels/overseer.queue.v1.jsonl', import.meta.url),
)
const codexLabelsPath = fileURLToPath(new URL('../labels/codex.labels.v1.jsonl', import.meta.url))

describe('golden labelling harness', () => {
  it('keeps label queues score-hidden and text-only', async () => {
    const codexQueue = await readJsonl<LabelQueueEntry>(codexQueuePath)
    const overseerQueue = await readJsonl<LabelQueueEntry>(overseerQueuePath)
    const corpus = await readCorpusJsonl(corpusPath)
    const corpusText = new Map(corpus.map((message) => [message.id, message.text]))

    expect(codexQueue).toHaveLength(30)
    expect(overseerQueue).toHaveLength(30)
    assertScoreHiddenQueue(codexQueue)
    assertScoreHiddenQueue(overseerQueue)
    for (const entry of [...codexQueue, ...overseerQueue]) {
      expect(corpusText.get(entry.id)).toBe(entry.text)
    }
  })

  it('keeps a rubric-overlap slice between codex and overseer queues', async () => {
    const codexQueue = await readJsonl<LabelQueueEntry>(codexQueuePath)
    const overseerQueue = await readJsonl<LabelQueueEntry>(overseerQueuePath)
    const codexIds = new Set(codexQueue.map((entry) => entry.id))
    const overlap = overseerQueue.filter((entry) => codexIds.has(entry.id))

    expect(overlap).toHaveLength(10)
  })

  it('validates codex labels without exposing model scores', async () => {
    const codexQueue = await readJsonl<LabelQueueEntry>(codexQueuePath)
    const codexLabels = await readJsonl<GoldenLabel>(codexLabelsPath)

    expect(codexLabels).toHaveLength(30)
    assertScoreHiddenLabels(codexLabels)
    assertLabelsMatchQueue(codexQueue, codexLabels)
  })
})

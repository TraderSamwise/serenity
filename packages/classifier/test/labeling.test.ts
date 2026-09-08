import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertLabelsMatchQueue,
  assertScoreHiddenLabels,
  assertScoreHiddenQueue,
  assertTextOnlyGoldenLabels,
  expectedVerdictsFromTextLabel,
  LABEL_REASON_CATEGORIES,
  readJsonl,
} from '../src/labeling'
import type { GoldenLabel, LabelQueueEntry, TextOnlyGoldenLabel } from '../src/labeling'
import { readCorpusJsonl } from '../src/cache'

const corpusPath = fileURLToPath(new URL('../fixtures/corpus.jsonl', import.meta.url))
const codexQueuePath = fileURLToPath(new URL('../labels/codex.queue.v1.jsonl', import.meta.url))
const overseerQueuePath = fileURLToPath(
  new URL('../labels/overseer.queue.v1.jsonl', import.meta.url),
)
const codexLabelsPath = fileURLToPath(new URL('../labels/codex.labels.v1.jsonl', import.meta.url))
const overseerLabelsPath = fileURLToPath(
  new URL('../labels/overseer.labels.v1.jsonl', import.meta.url),
)
const codexV2LabelsPath = fileURLToPath(new URL('../labels/codex.labels.v2.jsonl', import.meta.url))
const overseerV2LabelsPath = fileURLToPath(
  new URL('../labels/overseer.labels.v2.jsonl', import.meta.url),
)

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

  it('validates committed v1 labels without exposing model scores', async () => {
    const codexQueue = await readJsonl<LabelQueueEntry>(codexQueuePath)
    const overseerQueue = await readJsonl<LabelQueueEntry>(overseerQueuePath)
    const codexLabels = await readJsonl<GoldenLabel>(codexLabelsPath)
    const overseerLabels = await readJsonl<GoldenLabel>(overseerLabelsPath)

    expect(codexLabels).toHaveLength(30)
    expect(overseerLabels).toHaveLength(30)
    assertScoreHiddenLabels(codexLabels)
    assertScoreHiddenLabels(overseerLabels)
    assertLabelsMatchQueue(codexQueue, codexLabels)
    assertLabelsMatchQueue(overseerQueue, overseerLabels)
    expect(LABEL_REASON_CATEGORIES).toEqual(['severe', 'harm', 'protected', 'visible'])
  })

  it('validates text-level labels without per-preset score guessing', () => {
    const labels: TextOnlyGoldenLabel[] = [
      {
        id: 'harmful-001',
        harmful: true,
        primaryAxis: 'coercion',
        severity: 'high',
        protectiveSignal: 'none',
        notes: 'Human judgement of the text, not a threshold outcome.',
      },
      {
        id: 'visible-001',
        harmful: false,
        primaryAxis: 'none',
        severity: 'none',
        protectiveSignal: 'business_inquiry',
      },
    ]

    assertTextOnlyGoldenLabels(labels)
  })

  it('validates migrated v2 text labels and derives preset verdicts', async () => {
    const codexQueue = await readJsonl<LabelQueueEntry>(codexQueuePath)
    const overseerQueue = await readJsonl<LabelQueueEntry>(overseerQueuePath)
    const codexLabels = await readJsonl<TextOnlyGoldenLabel>(codexV2LabelsPath)
    const overseerLabels = await readJsonl<TextOnlyGoldenLabel>(overseerV2LabelsPath)

    expect(codexLabels).toHaveLength(30)
    expect(overseerLabels).toHaveLength(30)
    assertTextOnlyGoldenLabels(codexLabels)
    assertTextOnlyGoldenLabels(overseerLabels)
    assertLabelsMatchQueue(codexQueue, codexLabels)
    assertLabelsMatchQueue(overseerQueue, overseerLabels)

    expect(expectedVerdictsFromTextLabel(codexLabels[0]!)).toEqual({
      aggressive_standard: 'hide',
      balanced_standard: 'show',
      aggressive_nsfw: 'show',
    })
    expect(expectedVerdictsFromTextLabel(overseerLabels[11]!)).toEqual({
      aggressive_standard: 'hide',
      balanced_standard: 'hide',
      aggressive_nsfw: 'hide',
    })
  })
})

import { readFile } from 'node:fs/promises'

export const LABEL_CONTEXTS = [
  'aggressive_standard',
  'balanced_standard',
  'aggressive_nsfw',
] as const

export const LABEL_REASON_CATEGORIES = [
  'severe',
  'harm',
  'protected',
  'sentiment_middle_band',
  'low_confidence',
  'visible',
] as const

export type LabelContext = (typeof LABEL_CONTEXTS)[number]
export type LabelReasonCategory = (typeof LABEL_REASON_CATEGORIES)[number]
export type LabelVerdict = 'hide' | 'show'

export interface LabelQueueEntry {
  id: string
  text: string
}

export interface GoldenLabel {
  id: string
  expected: Record<LabelContext, LabelVerdict>
  reasonCategory: LabelReasonCategory
  notes?: string
}

const QUEUE_KEYS = ['id', 'text'] as const
const LABEL_KEYS = ['expected', 'id', 'notes', 'reasonCategory'] as const

export async function readJsonl<T>(path: string): Promise<T[]> {
  const contents = await readFile(path, 'utf8')
  return contents
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T)
}

export function assertScoreHiddenQueue(entries: readonly LabelQueueEntry[]): void {
  for (const entry of entries) {
    assertOnlyKeys(entry, QUEUE_KEYS)
    if (entry.id.length === 0 || entry.text.length === 0) {
      throw new Error(`Invalid label queue entry ${entry.id}.`)
    }
  }
}

export function assertScoreHiddenLabels(labels: readonly GoldenLabel[]): void {
  for (const label of labels) {
    assertOnlyKeys(label, LABEL_KEYS)
    assertOnlyKeys(label.expected, LABEL_CONTEXTS)
    if (!LABEL_REASON_CATEGORIES.includes(label.reasonCategory)) {
      throw new Error(`Invalid reason category for ${label.id}.`)
    }
  }
}

export function assertLabelsMatchQueue(
  queue: readonly LabelQueueEntry[],
  labels: readonly GoldenLabel[],
): void {
  const queueIds = new Set(queue.map((entry) => entry.id))
  const seen = new Set<string>()
  for (const label of labels) {
    if (!queueIds.has(label.id)) throw new Error(`Label ${label.id} is not in the queue.`)
    if (seen.has(label.id)) throw new Error(`Duplicate label ${label.id}.`)
    seen.add(label.id)
  }
  if (seen.size !== queueIds.size) {
    throw new Error(`Expected ${queueIds.size} labels, found ${seen.size}.`)
  }
}

function assertOnlyKeys(value: object, allowed: readonly string[]): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key))
  if (extras.length > 0) throw new Error(`Unexpected label field(s): ${extras.join(', ')}`)
}

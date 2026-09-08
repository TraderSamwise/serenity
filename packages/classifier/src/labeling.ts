import { readFile } from 'node:fs/promises'
import { HARM_AXES, OVERRIDE_AXES } from '@serenity/core'
import type { HarmAxis, OverrideAxis } from '@serenity/core'

export const LABEL_CONTEXTS = [
  'aggressive_standard',
  'balanced_standard',
  'aggressive_nsfw',
] as const

export const LABEL_REASON_CATEGORIES = [
  'severe',
  'harm',
  'protected',
  'visible',
] as const

export const HUMAN_HARM_SEVERITIES = ['none', 'low', 'medium', 'high', 'severe'] as const

export type LabelContext = (typeof LABEL_CONTEXTS)[number]
export type LabelReasonCategory = (typeof LABEL_REASON_CATEGORIES)[number]
export type LabelVerdict = 'hide' | 'show'
export type HumanHarmSeverity = (typeof HUMAN_HARM_SEVERITIES)[number]
export type HumanLabelAxis = HarmAxis | OverrideAxis | 'none'

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

export interface TextOnlyGoldenLabel {
  id: string
  harmful: boolean
  primaryAxis: HumanLabelAxis
  severity: HumanHarmSeverity
  notes?: string
}

const QUEUE_KEYS = ['id', 'text'] as const
const LABEL_KEYS = ['expected', 'id', 'notes', 'reasonCategory'] as const
const TEXT_ONLY_LABEL_KEYS = ['harmful', 'id', 'notes', 'primaryAxis', 'severity'] as const

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

export function assertTextOnlyGoldenLabels(labels: readonly TextOnlyGoldenLabel[]): void {
  const axes = new Set<HumanLabelAxis>([...HARM_AXES, ...OVERRIDE_AXES, 'none'])
  for (const label of labels) {
    assertOnlyKeys(label, TEXT_ONLY_LABEL_KEYS)
    if (!axes.has(label.primaryAxis)) throw new Error(`Invalid primary axis for ${label.id}.`)
    if (!HUMAN_HARM_SEVERITIES.includes(label.severity)) {
      throw new Error(`Invalid harm severity for ${label.id}.`)
    }
    if (label.harmful && label.primaryAxis === 'none') {
      throw new Error(`Harmful label ${label.id} must name an axis.`)
    }
    if (!label.harmful && label.severity !== 'none') {
      throw new Error(`Visible label ${label.id} must use none severity.`)
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

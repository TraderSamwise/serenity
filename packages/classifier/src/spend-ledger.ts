import { appendFile } from 'node:fs/promises'
import {
  estimateOpenAICostUsd,
  OPENAI_PRICING_CHECKED_AT,
  OPENAI_PRICING_SOURCE_URL,
} from './pricing'
import type { TokenUsageEstimate } from './pricing'
import { CLASSIFIER_MODEL } from './schema'
import { CLASSIFIER_RUBRIC_VERSION } from './prompt'
import type { RubricField } from './prompt'

export const SPEND_LEDGER_PATH = 'spend-ledger.v1.jsonl'

export interface SpendLedgerRow {
  date: string
  source: 'corpus_runner' | 'paid_test' | 'backfill'
  model: string
  rubricVersion: number
  fieldsRequested: readonly RubricField[] | ['all'] | ['unknown']
  messagesClassified: number | null
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  estimatedCostUsd: number | null
  measuredCostUsd: number | null
  costStatus: 'projected' | 'estimated_unreconciled' | 'dashboard_measured' | 'reconciled'
  dashboardRatio: number | null
  reconstructed: boolean
  pricing: {
    checkedAt: string
    sourceUrl: string
  }
  notes?: string
}

export async function appendSpendLedgerRow(
  path: string,
  row: Omit<SpendLedgerRow, 'pricing'>,
): Promise<void> {
  await appendFile(
    path,
    `${JSON.stringify({
      ...row,
      pricing: {
        checkedAt: OPENAI_PRICING_CHECKED_AT,
        sourceUrl: OPENAI_PRICING_SOURCE_URL,
      },
    })}\n`,
    'utf8',
  )
}

export function measuredSpendLedgerRow(options: {
  source: 'corpus_runner' | 'paid_test'
  fieldsRequested: readonly RubricField[]
  messagesClassified: number
  usage: TokenUsageEstimate & { totalTokens: number }
  notes?: string
}): Omit<SpendLedgerRow, 'pricing'> {
  const row: Omit<SpendLedgerRow, 'pricing'> = {
    date: new Date().toISOString(),
    source: options.source,
    model: CLASSIFIER_MODEL,
    rubricVersion: CLASSIFIER_RUBRIC_VERSION,
    fieldsRequested: options.fieldsRequested,
    messagesClassified: options.messagesClassified,
    inputTokens: options.usage.inputTokens,
    cachedInputTokens: options.usage.cachedInputTokens,
    outputTokens: options.usage.outputTokens,
    totalTokens: options.usage.totalTokens,
    estimatedCostUsd: estimateOpenAICostUsd(options.usage),
    measuredCostUsd: null,
    costStatus: 'estimated_unreconciled',
    dashboardRatio: null,
    reconstructed: false,
  }
  if (options.notes !== undefined) row.notes = options.notes
  return row
}

export function reconcileSpendLedgerRow(
  row: SpendLedgerRow,
  measuredCostUsd: number,
): SpendLedgerRow {
  return {
    ...row,
    measuredCostUsd,
    costStatus: 'reconciled',
    dashboardRatio: row.estimatedCostUsd === null ? null : measuredCostUsd / row.estimatedCostUsd,
  }
}

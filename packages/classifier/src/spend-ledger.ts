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
  source: 'corpus_runner' | 'paid_test' | 'price_probe' | 'backfill'
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
  costStatus:
    | 'projected'
    | 'estimated_unreconciled'
    | 'dashboard_measured'
    | 'reconciled'
    | 'reconciled_by_ratio'
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
  source: 'corpus_runner' | 'paid_test' | 'price_probe'
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

export function reconcileSpendLedgerRowByRatio(
  row: SpendLedgerRow,
  dashboardRatio: number,
): SpendLedgerRow {
  return {
    ...row,
    measuredCostUsd:
      row.estimatedCostUsd === null ? null : roundUsd(row.estimatedCostUsd * dashboardRatio),
    costStatus: row.estimatedCostUsd === null ? row.costStatus : 'reconciled_by_ratio',
    dashboardRatio: row.estimatedCostUsd === null ? row.dashboardRatio : dashboardRatio,
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

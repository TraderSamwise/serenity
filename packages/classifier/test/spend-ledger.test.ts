import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readJsonl } from '../src/labeling'
import { reconcileSpendLedgerRow } from '../src/spend-ledger'
import type { SpendLedgerRow } from '../src/spend-ledger'

const ledgerPath = fileURLToPath(new URL('../spend-ledger.v1.jsonl', import.meta.url))

describe('spend ledger', () => {
  it('backfills prior paid runs with pricing provenance', async () => {
    const rows = await readJsonl<SpendLedgerRow>(ledgerPath)
    const backfilled = rows.filter((row) => row.source === 'backfill')

    expect(backfilled).toHaveLength(6)
    expect(backfilled.every((row) => row.reconstructed)).toBe(true)
    expect(backfilled[0]).toMatchObject({
      totalTokens: 816_264,
      measuredCostUsd: 0.05,
      costStatus: 'dashboard_measured',
      pricing: {
        checkedAt: '2026-09-08',
        sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5-mini',
      },
    })

    expect(backfilled[4]).toMatchObject({
      rubricVersion: 5,
      cachedInputTokens: null,
      costStatus: 'estimated_unreconciled',
    })
  })

  it('records dashboard reconciliation as a ratio against the estimate', () => {
    const row = reconcileSpendLedgerRow(
      {
        date: '2026-09-08',
        source: 'corpus_runner',
        model: 'gpt-5-mini-2025-08-07',
        rubricVersion: 6,
        fieldsRequested: ['coercion'],
        messagesClassified: 314,
        inputTokens: 100,
        cachedInputTokens: 80,
        outputTokens: 20,
        totalTokens: 120,
        estimatedCostUsd: 0.01,
        measuredCostUsd: null,
        costStatus: 'estimated_unreconciled',
        dashboardRatio: null,
        reconstructed: false,
        pricing: {
          checkedAt: '2026-09-08',
          sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5-mini',
        },
      },
      0.011,
    )

    expect(row.costStatus).toBe('reconciled')
    expect(row.measuredCostUsd).toBe(0.011)
    expect(row.dashboardRatio).toBeCloseTo(1.1)
  })
})

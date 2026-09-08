import { appendSpendLedgerRow, measuredSpendLedgerRow } from './spend-ledger'
import type { RubricField } from './prompt'
import type { TokenUsageEstimate } from './pricing'

export const PAID_TESTS_DEFAULT_ENABLED = true
export const PAID_TESTS_FLAG = 'SERENITY_RUN_PAID_TESTS'

export function paidTestsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SERENITY_OPENAI_API_KEY === undefined) return false
  const value = env[PAID_TESTS_FLAG]
  if (value === undefined) return PAID_TESTS_DEFAULT_ENABLED
  return value === '1' || value.toLowerCase() === 'true'
}

export async function recordPaidTestSpend(options: {
  ledgerPath: string
  fieldsRequested: readonly RubricField[]
  messagesClassified: number
  usage: TokenUsageEstimate & { totalTokens: number }
  notes?: string
}): Promise<void> {
  await appendSpendLedgerRow(
    options.ledgerPath,
    measuredSpendLedgerRow({ source: 'paid_test', ...options }),
  )
}

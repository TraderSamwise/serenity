import { resolve } from 'node:path'
import { classifyFieldsWithOpenAIResult } from './openai'
import { estimateRunCost } from './pricing'
import { paidRunRefusalMessage, shouldRefusePaidRun } from './run-gate'
import { appendSpendLedgerRow, measuredSpendLedgerRow } from './spend-ledger'
import type { CorpusMessage } from './cache'
import type { RubricField } from './prompt'

const LEDGER_PATH = resolve('spend-ledger.v1.jsonl')
const INSTALL_ID = 'serenity-price-reconciliation-v1'
const FIELDS = ['transactional'] as const satisfies readonly RubricField[]
const MESSAGES: readonly CorpusMessage[] = [
  { id: 'price-probe-001', text: 'Can support check why my receipt is pending?', tags: [] },
  { id: 'price-probe-002', text: 'The invoice number is missing from my account.', tags: [] },
  { id: 'price-probe-003', text: 'Please confirm whether this payment went through.', tags: [] },
  { id: 'price-probe-004', text: 'I cannot open the download after paying.', tags: [] },
  { id: 'price-probe-005', text: 'Can you resend the subscription confirmation?', tags: [] },
  { id: 'price-probe-006', text: 'The billing email has the wrong name on it.', tags: [] },
  { id: 'price-probe-007', text: 'I need a refund for the duplicate charge.', tags: [] },
  { id: 'price-probe-008', text: 'The link says expired even though I just bought it.', tags: [] },
  { id: 'price-probe-009', text: 'Please update the shipping address before it goes out.', tags: [] },
  { id: 'price-probe-010', text: 'The access code worked yesterday and now fails.', tags: [] },
  { id: 'price-probe-011', text: 'Could you check whether my order was cancelled?', tags: [] },
  { id: 'price-probe-012', text: 'I was billed but the content is still locked.', tags: [] },
  { id: 'price-probe-013', text: 'Please send a receipt for the last renewal.', tags: [] },
  { id: 'price-probe-014', text: 'The checkout page charged me twice.', tags: [] },
  { id: 'price-probe-015', text: 'Can someone help recover my paid account?', tags: [] },
  { id: 'price-probe-016', text: 'The subscription says active but messages are unavailable.', tags: [] },
  { id: 'price-probe-017', text: 'I need to change the card before renewal.', tags: [] },
  { id: 'price-probe-018', text: 'Can you verify the plan I bought?', tags: [] },
]

async function main(): Promise<void> {
  const projection = estimateRunCost(MESSAGES.map((message) => ({ message, fields: FIELDS })))
  console.log(
    [
      `projected_classified=${MESSAGES.length}`,
      `projected_fields=${FIELDS.join(',')}`,
      `estimated_input_tokens=${projection.inputTokens}`,
      `estimated_cached_input_tokens=${projection.cachedInputTokens}`,
      `estimated_output_tokens=${projection.outputTokens}`,
      `estimated_cost_usd=${projection.estimatedCostUsd.toFixed(4)}`,
    ].join(' '),
  )

  if (shouldRefusePaidRun(MESSAGES.length)) {
    console.error(paidRunRefusalMessage(MESSAGES.length, projection))
    process.exitCode = 1
    return
  }

  const apiKey = process.env.SERENITY_OPENAI_API_KEY
  if (!apiKey) {
    console.error(
      'Missing OpenAI API key. Put SERENITY_OPENAI_API_KEY in packages/classifier/.env.local.',
    )
    process.exitCode = 1
    return
  }

  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const started = Date.now()
  for (const message of MESSAGES) {
    const response = await classifyFieldsWithOpenAIResult(message, {
      apiKey,
      installId: INSTALL_ID,
      fields: FIELDS,
    })
    usage.inputTokens += response.usage.input_tokens
    usage.cachedInputTokens += response.usage.input_tokens_details?.cached_tokens ?? 0
    usage.outputTokens += response.usage.output_tokens
    usage.totalTokens += response.usage.total_tokens
  }
  const wallClockSeconds = (Date.now() - started) / 1000
  const ledgerRow = measuredSpendLedgerRow({
    source: 'price_probe',
    fieldsRequested: FIELDS,
    messagesClassified: MESSAGES.length,
    usage,
    notes: 'Tiny one-axis paid run to reconcile cached-input pricing against dashboard billing.',
  })
  await appendSpendLedgerRow(LEDGER_PATH, ledgerRow)

  console.log(
    [
      `classified=${MESSAGES.length}`,
      `input_tokens=${usage.inputTokens}`,
      `cached_input_tokens=${usage.cachedInputTokens}`,
      `output_tokens=${usage.outputTokens}`,
      `total_tokens=${usage.totalTokens}`,
      `estimated_cost_usd=${ledgerRow.estimatedCostUsd!.toFixed(4)}`,
      `cost_status=${ledgerRow.costStatus}`,
      `wall_clock_seconds=${wallClockSeconds.toFixed(1)}`,
      `ledger=${LEDGER_PATH}`,
    ].join(' '),
  )
}

await main()

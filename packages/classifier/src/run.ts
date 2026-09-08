import { resolve } from 'node:path'
import {
  classifyMissingCorpusEntries,
  loadClassificationCache,
  planMissingCorpusEntries,
  readCorpusJsonl,
} from './cache'
import { classifyFieldsWithOpenAIResult } from './openai'
import { estimateRunCost } from './pricing'
import { paidRunRefusalMessage, shouldRefusePaidRun } from './run-gate'
import { appendSpendLedgerRow, measuredSpendLedgerRow } from './spend-ledger'
import type { RubricField } from './prompt'

const CORPUS_PATH = resolve('fixtures/corpus.jsonl')
const CACHE_PATH = resolve('fixtures/classification-cache.v1.json')
const LEDGER_PATH = resolve('spend-ledger.v1.jsonl')
const DEFAULT_INSTALL_ID = 'serenity-fixture-corpus-v1'

async function main(): Promise<void> {
  const corpus = await readCorpusJsonl(CORPUS_PATH)
  const cache = await loadClassificationCache(CACHE_PATH)
  const plan = planMissingCorpusEntries(corpus, cache)
  const requestedFields = [...new Set(plan.requests.flatMap((request) => request.fields))]
  const projection = estimateRunCost(plan.requests)
  console.log(
    [
      `projected_classified=${plan.requests.length}`,
      `projected_skipped=${plan.skipped}`,
      `projected_fields=${formatFields(requestedFields)}`,
      `estimated_input_tokens=${projection.inputTokens}`,
      `estimated_cached_input_tokens=${projection.cachedInputTokens}`,
      `estimated_output_tokens=${projection.outputTokens}`,
      `estimated_cost_usd=${projection.estimatedCostUsd.toFixed(4)}`,
    ].join(' '),
  )

  if (shouldRefusePaidRun(plan.requests.length)) {
    console.error(paidRunRefusalMessage(plan.requests.length, projection))
    process.exitCode = 1
    return
  }

  const apiKey = process.env.SERENITY_OPENAI_API_KEY
  if (plan.requests.length > 0 && !apiKey) {
    console.error(
      'Missing OpenAI API key. Put SERENITY_OPENAI_API_KEY in packages/classifier/.env.local.',
    )
    process.exitCode = 1
    return
  }

  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const started = Date.now()
  const result = await classifyMissingCorpusEntries(corpus, cache, CACHE_PATH, async (message, fields) => {
    const response = await classifyFieldsWithOpenAIResult(message, {
      apiKey: apiKey!,
      installId: process.env.SERENITY_INSTALL_ID ?? DEFAULT_INSTALL_ID,
      fields,
    })
    usage.inputTokens += response.usage.input_tokens
    usage.cachedInputTokens += response.usage.input_tokens_details?.cached_tokens ?? 0
    usage.outputTokens += response.usage.output_tokens
    usage.totalTokens += response.usage.total_tokens
    return response.output
  })
  const wallClockSeconds = (Date.now() - started) / 1000
  const ledgerRow = measuredSpendLedgerRow({
    source: 'corpus_runner',
    fieldsRequested: requestedFields as RubricField[],
    messagesClassified: result.classified,
    usage,
  })
  if (result.classified > 0) {
    await appendSpendLedgerRow(LEDGER_PATH, ledgerRow)
  }

  console.log(
    [
      `classified=${result.classified}`,
      `skipped=${result.skipped}`,
      `total=${corpus.length}`,
      `input_tokens=${usage.inputTokens}`,
      `cached_input_tokens=${usage.cachedInputTokens}`,
      `output_tokens=${usage.outputTokens}`,
      `total_tokens=${usage.totalTokens}`,
      `estimated_cost_usd=${ledgerRow.estimatedCostUsd!.toFixed(4)}`,
      `cost_status=${result.classified === 0 ? 'no_spend' : ledgerRow.costStatus}`,
      `wall_clock_seconds=${wallClockSeconds.toFixed(1)}`,
      `cache=${CACHE_PATH}`,
      `ledger=${LEDGER_PATH}`,
    ].join(' '),
  )
}

await main()

function formatFields(fields: readonly string[]): string {
  return fields.length === 0 ? 'none' : fields.join(',')
}

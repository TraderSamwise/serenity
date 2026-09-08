import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyFieldsWithOpenAIResult } from '../src/openai'
import { paidTestsEnabled, PAID_TESTS_DEFAULT_ENABLED, recordPaidTestSpend } from '../src/paid-tests'

const runPaid = paidTestsEnabled()

describe.skipIf(!runPaid)('paid OpenAI classifier smoke', () => {
  it('classifies one field and records spend', async () => {
    const apiKey = process.env.SERENITY_OPENAI_API_KEY
    expect(apiKey).toBeDefined()

    const response = await classifyFieldsWithOpenAIResult(
      { id: 'paid-smoke-001', text: 'Please review the invoice when you can.', tags: [] },
      {
        apiKey: apiKey!,
        installId: 'serenity-paid-test-v1',
        fields: ['transactional'],
      },
    )

    await recordPaidTestSpend({
      ledgerPath: resolve('spend-ledger.v1.jsonl'),
      fieldsRequested: ['transactional'],
      messagesClassified: 1,
      usage: {
        inputTokens: response.usage.input_tokens,
        cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens,
      },
      notes: `Paid smoke test. Default enabled: ${PAID_TESTS_DEFAULT_ENABLED}.`,
    })

    expect(response.output.transactional).toBeGreaterThanOrEqual(0)
  })
})

import { describe, expect, it } from 'vitest'
import {
  estimateOpenAICostUsd,
  GPT_5_MINI_CACHED_INPUT_USD_PER_MILLION,
  GPT_5_MINI_INPUT_USD_PER_MILLION,
  GPT_5_MINI_MIN_CACHEABLE_PREFIX_TOKENS,
  GPT_5_MINI_OUTPUT_USD_PER_MILLION,
  OPENAI_PRICING_CHECKED_AT,
  estimateRunCost,
} from '../src/pricing'

describe('classifier pricing', () => {
  it('pins dated gpt-5-mini token prices', () => {
    expect(OPENAI_PRICING_CHECKED_AT).toBe('2026-09-08')
    expect(GPT_5_MINI_INPUT_USD_PER_MILLION).toBe(0.25)
    expect(GPT_5_MINI_CACHED_INPUT_USD_PER_MILLION).toBe(0.025)
    expect(GPT_5_MINI_OUTPUT_USD_PER_MILLION).toBe(2)
    expect(GPT_5_MINI_MIN_CACHEABLE_PREFIX_TOKENS).toBe(2_048)
  })

  it('uses cached-input pricing instead of total-token headline pricing', () => {
    const cost = estimateOpenAICostUsd({
      inputTokens: 802_264,
      cachedInputTokens: 790_000,
      outputTokens: 14_000,
    })

    expect(cost).toBeCloseTo(0.0508, 4)
  })

  it('does not project prompt-cache hits below the model cacheable prefix minimum', () => {
    const estimate = estimateRunCost(
      Array.from({ length: 18 }, (_, index) => ({
        message: {
          id: `price-probe-${index}`,
          text: 'Please confirm whether this payment went through.',
          tags: [],
        },
        fields: ['transactional'],
      })),
    )

    expect(estimate.cachedInputTokens).toBe(0)
  })
})

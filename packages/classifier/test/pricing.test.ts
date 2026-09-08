import { describe, expect, it } from 'vitest'
import {
  estimateOpenAICostUsd,
  GPT_5_MINI_CACHED_INPUT_USD_PER_MILLION,
  GPT_5_MINI_INPUT_USD_PER_MILLION,
  GPT_5_MINI_OUTPUT_USD_PER_MILLION,
  OPENAI_PRICING_CHECKED_AT,
} from '../src/pricing'

describe('classifier pricing', () => {
  it('pins dated gpt-5-mini token prices', () => {
    expect(OPENAI_PRICING_CHECKED_AT).toBe('2026-09-08')
    expect(GPT_5_MINI_INPUT_USD_PER_MILLION).toBe(0.25)
    expect(GPT_5_MINI_CACHED_INPUT_USD_PER_MILLION).toBe(0.025)
    expect(GPT_5_MINI_OUTPUT_USD_PER_MILLION).toBe(2)
  })

  it('uses cached-input pricing instead of total-token headline pricing', () => {
    const cost = estimateOpenAICostUsd({
      inputTokens: 802_264,
      cachedInputTokens: 790_000,
      outputTokens: 14_000,
    })

    expect(cost).toBeCloseTo(0.0508, 4)
  })
})

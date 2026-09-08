import { describe, expect, it } from 'vitest'
import { paidRunRefusalMessage, shouldRefusePaidRun } from '../src/run-gate'

describe('paid classifier run gate', () => {
  it('requires explicit opt-in only when classifications would spend', () => {
    expect(shouldRefusePaidRun(1, {})).toBe(true)
    expect(shouldRefusePaidRun(1, { SERENITY_ALLOW_PAID_RUN: '1' })).toBe(false)
    expect(shouldRefusePaidRun(0, {})).toBe(false)
  })

  it('names the opt-in variable and projected cost in the refusal', () => {
    expect(
      paidRunRefusalMessage(12, {
        inputTokens: 1000,
        cachedInputTokens: 900,
        outputTokens: 50,
        estimatedCostUsd: 0.0001,
      }),
    ).toContain('SERENITY_ALLOW_PAID_RUN=1')
    expect(
      paidRunRefusalMessage(12, {
        inputTokens: 1000,
        cachedInputTokens: 900,
        outputTokens: 50,
        estimatedCostUsd: 0.0001,
      }),
    ).toContain('estimated_cost_usd=0.0001')
  })
})

import { describe, expect, it } from 'vitest'
import { paidTestsEnabled, PAID_TESTS_DEFAULT_ENABLED, PAID_TESTS_FLAG } from '../src/paid-tests'

describe('paid test switch', () => {
  it('is one constant away from flipping the default', () => {
    expect(PAID_TESTS_DEFAULT_ENABLED).toBe(true)
  })

  it('skips paid tests when no key is present', () => {
    expect(paidTestsEnabled({ [PAID_TESTS_FLAG]: '1' })).toBe(false)
  })

  it('defaults on when a key is present and accepts an explicit off flag', () => {
    expect(paidTestsEnabled({ SERENITY_OPENAI_API_KEY: 'test-key' })).toBe(true)
    expect(
      paidTestsEnabled({
        SERENITY_OPENAI_API_KEY: 'test-key',
        [PAID_TESTS_FLAG]: '0',
      }),
    ).toBe(false)
  })
})

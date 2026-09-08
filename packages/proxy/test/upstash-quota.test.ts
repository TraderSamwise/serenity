import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@serenity/classifier'
import {
  UpstashQuotaStore,
  globalClassificationsKey,
  globalTokensKey,
} from '../src/upstash-quota'
import type { QuotaOptions } from '../src/quota'

const openQuota: QuotaOptions = {
  perInstallTier2Quota: 10,
  globalTier2Ceiling: 10,
  globalTokenCeiling: 1000,
  tier2Enabled: true,
}

describe('UpstashQuotaStore', () => {
  it('uses the hashed install id with the daily ratelimit before reserving global counters', async () => {
    const redis = new FakeQuotaRedis()
    const ratelimiter = new FakeRatelimiter()
    const store = new UpstashQuotaStore(redis, ratelimiter, openQuota)

    expect(await store.reserveTier2('install-123', 75)).toBe(true)

    expect(ratelimiter.identifiers).toEqual([sha256Hex('install-123')])
    expect(redis.operations).toEqual([
      ['eval', [globalClassificationsKey(), globalTokensKey()], ['75', '10', '1000']],
    ])
    expect(redis.values.get(globalClassificationsKey())).toBe(1)
    expect(redis.values.get(globalTokensKey())).toBe(75)
  })

  it('does not reserve global counters when the per-install daily limit denies', async () => {
    const redis = new FakeQuotaRedis()
    const ratelimiter = new FakeRatelimiter(false)
    const store = new UpstashQuotaStore(redis, ratelimiter, openQuota)

    expect(await store.reserveTier2('install-123', 75)).toBe(false)
    expect(redis.operations).toEqual([
      ['eval', [globalClassificationsKey(), globalTokensKey()], ['75', '10', '1000']],
      ['incrby', globalClassificationsKey(), -1],
      ['incrby', globalTokensKey(), -75],
    ])
    expect(redis.values.get(globalClassificationsKey())).toBe(0)
    expect(redis.values.get(globalTokensKey())).toBe(0)
  })

  it('blocks tier 2 when the global classification ceiling is exhausted', async () => {
    const redis = new FakeQuotaRedis()
    const store = new UpstashQuotaStore(redis, new FakeRatelimiter(), {
      ...openQuota,
      globalTier2Ceiling: 1,
    })

    expect(await store.reserveTier2('install-123', 10)).toBe(true)
    expect(await store.reserveTier2('install-123', 10)).toBe(false)
    expect(redis.values.get(globalClassificationsKey())).toBe(1)
  })

  it('blocks tier 2 when the global token reservation crosses the ceiling', async () => {
    const redis = new FakeQuotaRedis()
    const store = new UpstashQuotaStore(redis, new FakeRatelimiter(), {
      ...openQuota,
      globalTokenCeiling: 100,
    })

    expect(await store.reserveTier2('install-123', 60)).toBe(true)
    expect(await store.reserveTier2('install-123', 50)).toBe(false)
    expect(redis.values.get(globalTokensKey())).toBe(60)
  })

  it('reconciles reserved token estimates to actual usage with atomic increments', async () => {
    const redis = new FakeQuotaRedis()
    const store = new UpstashQuotaStore(redis, new FakeRatelimiter(), openQuota)

    expect(await store.reserveTier2('install-123', 75)).toBe(true)
    await store.recordTier2('install-123', 60, 75)

    expect(redis.values.get(globalTokensKey())).toBe(60)
    expect(redis.operations.at(-1)).toEqual(['incrby', globalTokensKey(), -15])
  })

  it('does not allow paid tier 2 when the kill switch is off', async () => {
    const redis = new FakeQuotaRedis()
    const store = new UpstashQuotaStore(redis, new FakeRatelimiter(), {
      ...openQuota,
      tier2Enabled: false,
    })

    expect(await store.reserveTier2('install-123', 75)).toBe(false)
    expect(redis.operations).toEqual([])
  })
})

class FakeQuotaRedis {
  readonly values = new Map<string, number>()
  readonly operations: Array<
    ['eval', string[], string[]] | ['incrby', string, number]
  > = []

  async eval<TResult>(_script: string, keys: string[], args: string[]): Promise<TResult> {
    this.operations.push(['eval', keys, args])
    const [classificationKey, tokenKey] = keys
    const [estimatedTokens, classificationCeiling, tokenCeiling] = args.map(Number)
    const classifications = this.values.get(classificationKey!) ?? 0
    const tokens = this.values.get(tokenKey!) ?? 0
    if (classifications + 1 > classificationCeiling! || tokens + estimatedTokens! > tokenCeiling!) {
      return 0 as TResult
    }
    this.values.set(classificationKey!, classifications + 1)
    this.values.set(tokenKey!, tokens + estimatedTokens!)
    return 1 as TResult
  }

  async incrby(key: string, increment: number): Promise<number> {
    this.operations.push(['incrby', key, increment])
    const value = (this.values.get(key) ?? 0) + increment
    this.values.set(key, value)
    return value
  }
}

class FakeRatelimiter {
  readonly identifiers: string[] = []

  constructor(private readonly success = true) {}

  async limit(identifier: string): Promise<{ success: boolean; pending: Promise<unknown> }> {
    this.identifiers.push(identifier)
    return { success: this.success, pending: Promise.resolve() }
  }
}

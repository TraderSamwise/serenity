import { describe, expect, it } from 'vitest'
import { MemoryGlobalHashCache, textHash } from '../src/hash-cache'
import { classifyBatch } from '../src/classify'
import type { Tier1Client, Tier2Classifier } from '../src/classify'
import { MemoryQuotaStore } from '../src/quota'
import type { QuotaOptions } from '../src/quota'
import { FREE_TIER_MODEL, MODERATION_MODEL } from '../src/vector'
import { classification, moderation } from './helpers'

const openQuota: QuotaOptions = {
  perInstallTier2Quota: 100,
  globalTier2Ceiling: 100,
  globalTokenCeiling: 100000,
  tier2Enabled: true,
}

function deps(options: {
  tier1: Tier1Client
  tier2: Tier2Classifier
  quota?: QuotaOptions
}) {
  return {
    cache: new MemoryGlobalHashCache(),
    quota: new MemoryQuotaStore(options.quota ?? openQuota),
    tier1: options.tier1,
    tier2: options.tier2,
  }
}

describe('classifyBatch', () => {
  it('uses the global hash cache before calling free or paid tiers', async () => {
    const cache = new MemoryGlobalHashCache()
    const cached = classification({ insult: 0.8 })
    await cache.set(textHash('Repeat'), cached)
    let tier1Calls = 0
    let tier2Calls = 0

    const result = await classifyBatch(['Repeat'], 'install-1', {
      cache,
      quota: new MemoryQuotaStore(openQuota),
      tier1: {
        async moderate() {
          tier1Calls += 1
          return moderation({})
        },
      },
      tier2: {
        async classify() {
          tier2Calls += 1
          return { classification: classification(), usage: usage() }
        },
      },
    })

    expect(result.classifications).toEqual([cached])
    expect(tier1Calls).toBe(0)
    expect(tier2Calls).toBe(0)
  })

  it('lets tier 1 short-circuit only when every permissive profile would hide', async () => {
    let tier2Calls = 0
    const cache = new MemoryGlobalHashCache()
    const result = await classifyBatch(['awful'], 'install-1', {
      cache,
      quota: new MemoryQuotaStore(openQuota),
      tier1: {
        async moderate() {
          return moderation({ harassment: true })
        },
      },
      tier2: {
        async classify() {
          tier2Calls += 1
          return { classification: classification(), usage: usage() }
        },
      },
    })

    expect(result.classifications[0]?.model).toBe(MODERATION_MODEL)
    expect(result.classifications[0]?.scores.insult).toBe(1)
    expect(tier2Calls).toBe(0)
    expect(cache.entries.size).toBe(0)
  })

  it('returns local short-circuits without writing the vector cache', async () => {
    const cache = new MemoryGlobalHashCache()
    let tier1Calls = 0
    const result = await classifyBatch(['kill yourself'], 'install-1', {
      cache,
      quota: new MemoryQuotaStore(openQuota),
      tier1: {
        async moderate() {
          tier1Calls += 1
          return moderation({})
        },
      },
      tier2: {
        async classify() {
          return { classification: classification(), usage: usage() }
        },
      },
    })

    expect(result.classifications[0]?.scores.self_harm_directed).toBe(1)
    expect(tier1Calls).toBe(0)
    expect(cache.entries.size).toBe(0)
  })

  it('does not let a tier 1 flag permanently suppress protective tier 2 axes', async () => {
    const cache = new MemoryGlobalHashCache()
    const quota = new MemoryQuotaStore(openQuota)
    let tier1Flags = true
    let tier2Calls = 0
    const deps = {
      cache,
      quota,
      tier1: {
        async moderate() {
          return tier1Flags ? moderation({ harassment: true }) : moderation({})
        },
      },
      tier2: {
        async classify() {
          tier2Calls += 1
          return {
            classification: classification({
              insult: 0.8,
              business_inquiry: 0.95,
            }),
            usage: usage(),
          }
        },
      },
    }

    const first = await classifyBatch(
      ['flagged brand deal'],
      'install-1',
      deps,
    )
    tier1Flags = false
    const second = await classifyBatch(
      ['flagged brand deal'],
      'install-1',
      deps,
    )

    expect(first.classifications[0]?.model).toBe(MODERATION_MODEL)
    expect(second.classifications[0]?.scores.business_inquiry).toBe(0.95)
    expect(second.classifications[0]?.scores.insult).toBe(0.8)
    expect(tier2Calls).toBe(1)
    expect(cache.entries.size).toBe(1)
  })

  it('escalates a moderation signal that a permissive site profile could show', async () => {
    let tier2Calls = 0
    const calls: string[] = []
    const result = await classifyBatch(
      ['explicit but allowed elsewhere'],
      'install-1',
      deps({
        tier1: {
          async moderate() {
            calls.push('tier1')
            return moderation({ sexual: true })
          },
        },
        tier2: {
          async classify() {
            tier2Calls += 1
            calls.push('tier2')
            return { classification: classification({ sexual_explicit: 0.2 }), usage: usage() }
          },
        },
      }),
    )

    expect(tier2Calls).toBe(1)
    expect(calls).toEqual(['tier1', 'tier2'])
    expect(result.classifications[0]?.scores.sexual_explicit).toBe(0.2)
  })

  it('keeps free moderation catches alive when the tier 2 kill switch is off', async () => {
    let tier2Calls = 0
    const result = await classifyBatch(
      ['obvious harassment'],
      'install-1',
      deps({
        quota: {
          ...openQuota,
          tier2Enabled: false,
        },
        tier1: {
          async moderate() {
            return moderation({ harassment: true })
          },
        },
        tier2: {
          async classify() {
            tier2Calls += 1
            return { classification: classification({ insult: 1 }), usage: usage() }
          },
        },
      }),
    )

    expect(result.classifications[0]?.model).toBe(MODERATION_MODEL)
    expect(result.classifications[0]?.scores.insult).toBe(1)
    expect(tier2Calls).toBe(0)
  })

  it('degrades to free tiers instead of erroring when the paid ceiling is hit', async () => {
    let tier2Calls = 0
    const result = await classifyBatch(
      ['ordinary uncached text'],
      'install-1',
      deps({
        quota: {
          ...openQuota,
          globalTier2Ceiling: 0,
        },
        tier1: {
          async moderate() {
            return moderation({})
          },
        },
        tier2: {
          async classify() {
            tier2Calls += 1
            return { classification: classification({ insult: 1 }), usage: usage() }
          },
        },
      }),
    )

    expect(result.classifications[0]?.model).toBe(FREE_TIER_MODEL)
    expect(result.classifications[0]?.scores.insult).toBe(0)
    expect(tier2Calls).toBe(0)
  })

  it('applies per-install quota only to paid tier 2 classifications', async () => {
    let tier2Calls = 0
    const result = await classifyBatch(
      ['first uncached', 'second uncached'],
      'install-1',
      deps({
        quota: {
          ...openQuota,
          perInstallTier2Quota: 1,
        },
        tier1: {
          async moderate() {
            return moderation({})
          },
        },
        tier2: {
          async classify() {
            tier2Calls += 1
            return { classification: classification({ insult: 0.1 }), usage: usage() }
          },
        },
      }),
    )

    expect(tier2Calls).toBe(1)
    expect(result.classifications[0]?.scores.insult).toBe(0.1)
    expect(result.classifications[1]?.model).toBe(FREE_TIER_MODEL)
  })
})

function usage() {
  return {
    input_tokens: 10,
    output_tokens: 2,
    total_tokens: 12,
  }
}

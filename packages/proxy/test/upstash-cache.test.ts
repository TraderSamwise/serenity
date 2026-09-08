import { describe, expect, it } from 'vitest'
import { CLASSIFIER_RUBRIC_VERSION } from '@serenity/classifier'
import { SCHEMA_VERSION } from '@serenity/core'
import {
  UPSTASH_VECTOR_CACHE_TTL_SECONDS,
  UpstashGlobalHashCache,
  vectorCacheKey,
} from '../src/upstash-cache'
import { classification } from './helpers'

describe('UpstashGlobalHashCache', () => {
  it('stores versioned vector keys write-once with a bounded TTL', async () => {
    const redis = new FakeCacheRedis()
    const cache = new UpstashGlobalHashCache(redis)
    const vector = classification({ insult: 0.7 })

    await cache.set('abc123', vector)

    expect(redis.sets).toEqual([
      {
        key: `serenity:vector:s${SCHEMA_VERSION}:r${CLASSIFIER_RUBRIC_VERSION}:abc123`,
        value: vector,
        options: { ex: UPSTASH_VECTOR_CACHE_TTL_SECONDS, nx: true },
      },
    ])
  })

  it('returns undefined for absent Redis values and vectors for present ones', async () => {
    const redis = new FakeCacheRedis()
    const cache = new UpstashGlobalHashCache(redis)
    const vector = classification({ threat: 0.8 })
    redis.values.set(vectorCacheKey('present'), vector)

    expect(await cache.get('missing')).toBeUndefined()
    expect(await cache.get('present')).toEqual(vector)
  })
})

class FakeCacheRedis {
  readonly values = new Map<string, unknown>()
  readonly sets: Array<{
    key: string
    value: unknown
    options: { ex: number; nx: true }
  }> = []

  async get<TData>(key: string): Promise<TData | null> {
    return (this.values.get(key) as TData | undefined) ?? null
  }

  async set<TData>(
    key: string,
    value: TData,
    options: { ex: number; nx: true },
  ): Promise<'OK' | TData | null> {
    this.sets.push({ key, value, options })
    if (this.values.has(key)) return null
    this.values.set(key, value)
    return 'OK'
  }
}

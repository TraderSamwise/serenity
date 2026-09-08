import { Redis } from '@upstash/redis'
import { CLASSIFIER_RUBRIC_VERSION } from '@serenity/classifier/runtime'
import { SCHEMA_VERSION } from '@serenity/core'
import type { Classification } from '@serenity/core'
import type { GlobalHashCache } from './hash-cache'

export const UPSTASH_VECTOR_CACHE_TTL_SECONDS = 90 * 24 * 60 * 60
export const UPSTASH_CACHE_KEY_PREFIX = 'serenity'

export interface UpstashCacheRedis {
  get<TData>(key: string): Promise<TData | null>
  set<TData>(
    key: string,
    value: TData,
    options: { ex: number; nx: true },
  ): Promise<'OK' | TData | null>
}

export class UpstashGlobalHashCache implements GlobalHashCache {
  constructor(
    private readonly redis: UpstashCacheRedis,
    private readonly ttlSeconds = UPSTASH_VECTOR_CACHE_TTL_SECONDS,
    private readonly keyPrefix = UPSTASH_CACHE_KEY_PREFIX,
  ) {}

  async get(hash: string): Promise<Classification | undefined> {
    return (await this.redis.get<Classification>(vectorCacheKey(hash, this.keyPrefix))) ?? undefined
  }

  async set(hash: string, classification: Classification): Promise<void> {
    await this.redis.set(vectorCacheKey(hash, this.keyPrefix), classification, {
      ex: this.ttlSeconds,
      nx: true,
    })
  }
}

export function createUpstashGlobalHashCache(options: {
  url: string
  token: string
  ttlSeconds?: number
  keyPrefix?: string
}): UpstashGlobalHashCache {
  return new UpstashGlobalHashCache(
    new Redis({ url: options.url, token: options.token }),
    options.ttlSeconds,
    options.keyPrefix,
  )
}

export function vectorCacheKey(hash: string, prefix = UPSTASH_CACHE_KEY_PREFIX): string {
  return `${prefix}:vector:s${SCHEMA_VERSION}:r${CLASSIFIER_RUBRIC_VERSION}:${hash}`
}

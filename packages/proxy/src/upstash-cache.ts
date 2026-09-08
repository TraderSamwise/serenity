import { Redis } from '@upstash/redis'
import { CLASSIFIER_RUBRIC_VERSION } from '@serenity/classifier'
import { SCHEMA_VERSION } from '@serenity/core'
import type { Classification } from '@serenity/core'
import type { GlobalHashCache } from './hash-cache'

export const UPSTASH_VECTOR_CACHE_TTL_SECONDS = 90 * 24 * 60 * 60

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
  ) {}

  async get(hash: string): Promise<Classification | undefined> {
    return (await this.redis.get<Classification>(vectorCacheKey(hash))) ?? undefined
  }

  async set(hash: string, classification: Classification): Promise<void> {
    await this.redis.set(vectorCacheKey(hash), classification, {
      ex: this.ttlSeconds,
      nx: true,
    })
  }
}

export function createUpstashGlobalHashCache(options: {
  url: string
  token: string
  ttlSeconds?: number
}): UpstashGlobalHashCache {
  return new UpstashGlobalHashCache(
    new Redis({ url: options.url, token: options.token }),
    options.ttlSeconds,
  )
}

export function vectorCacheKey(hash: string): string {
  return `serenity:vector:s${SCHEMA_VERSION}:r${CLASSIFIER_RUBRIC_VERSION}:${hash}`
}

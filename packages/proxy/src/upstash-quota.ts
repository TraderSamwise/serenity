import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { sha256Hex } from '@serenity/classifier/runtime'
import type { QuotaOptions, QuotaStore } from './quota'

export interface UpstashQuotaRedis {
  eval<TResult>(script: string, keys: string[], args: string[]): Promise<TResult>
  incrby(key: string, increment: number): Promise<number>
}

export interface UpstashInstallRatelimiter {
  limit(
    identifier: string,
    request?: { rate?: number },
  ): Promise<{ success: boolean; pending: Promise<unknown> }>
}

export class UpstashQuotaStore implements QuotaStore {
  constructor(
    private readonly redis: UpstashQuotaRedis,
    private readonly installRatelimiter: UpstashInstallRatelimiter,
    private readonly options: QuotaOptions,
    private readonly keyPrefix = UPSTASH_QUOTA_KEY_PREFIX,
  ) {}

  async reserveTier2(installId: string, estimatedTokens: number): Promise<boolean> {
    if (!this.options.tier2Enabled) return false
    if (
      this.options.perInstallTier2Quota <= 0 ||
      this.options.globalTier2Ceiling <= 0 ||
      this.options.globalTokenCeiling <= 0
    ) {
      return false
    }

    const reserved = await this.reserveGlobalTier2(estimatedTokens)
    if (!reserved) return false

    const installKey = installUsageKey(installId)
    const installLimit = await this.installRatelimiter.limit(installKey)
    await installLimit.pending
    if (!installLimit.success) {
      await this.releaseGlobalTier2(estimatedTokens)
      return false
    }

    return true
  }

  async recordTier2(_installId: string, tokens: number, reservedTokens: number): Promise<void> {
    const adjustment = tokens - reservedTokens
    if (adjustment !== 0) await this.redis.incrby(globalTokensKey(this.keyPrefix), adjustment)
  }

  private async reserveGlobalTier2(estimatedTokens: number): Promise<boolean> {
    const reserved = await this.redis.eval<number>(
      GLOBAL_RESERVE_SCRIPT,
      [globalClassificationsKey(this.keyPrefix), globalTokensKey(this.keyPrefix)],
      [
        String(estimatedTokens),
        String(this.options.globalTier2Ceiling),
        String(this.options.globalTokenCeiling),
      ],
    )
    return reserved === 1
  }

  private async releaseGlobalTier2(estimatedTokens: number): Promise<void> {
    await Promise.all([
      this.redis.incrby(globalClassificationsKey(this.keyPrefix), -1),
      this.redis.incrby(globalTokensKey(this.keyPrefix), -estimatedTokens),
    ])
  }
}

export function createUpstashQuotaStore(options: {
  url: string
  token: string
  quota: QuotaOptions
  keyPrefix?: string
}): UpstashQuotaStore {
  const redis = new Redis({ url: options.url, token: options.token })
  const keyPrefix = options.keyPrefix ?? UPSTASH_QUOTA_KEY_PREFIX
  return new UpstashQuotaStore(
    redis,
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(
        Math.max(1, options.quota.perInstallTier2Quota),
        '1 d',
      ),
      prefix: `${keyPrefix}:ratelimit:tier2-per-install`,
      ephemeralCache: false,
    }),
    options.quota,
    keyPrefix,
  )
}

export const UPSTASH_QUOTA_KEY_PREFIX = 'serenity'

export const GLOBAL_RESERVE_SCRIPT = [
  'local classifications = tonumber(redis.call("GET", KEYS[1]) or "0")',
  'local tokens = tonumber(redis.call("GET", KEYS[2]) or "0")',
  'local estimated_tokens = tonumber(ARGV[1])',
  'local classification_ceiling = tonumber(ARGV[2])',
  'local token_ceiling = tonumber(ARGV[3])',
  'if classifications + 1 > classification_ceiling then return 0 end',
  'if tokens + estimated_tokens > token_ceiling then return 0 end',
  'redis.call("INCR", KEYS[1])',
  'redis.call("INCRBY", KEYS[2], estimated_tokens)',
  'return 1',
].join('\n')

export function globalClassificationsKey(prefix = UPSTASH_QUOTA_KEY_PREFIX): string {
  return `${prefix}:quota:global:tier2-classifications`
}

export function globalTokensKey(prefix = UPSTASH_QUOTA_KEY_PREFIX): string {
  return `${prefix}:quota:global:tokens`
}

export function installUsageKey(installId: string): string {
  return sha256Hex(installId)
}

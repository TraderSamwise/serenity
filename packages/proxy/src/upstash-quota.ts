import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { sha256Hex } from '@serenity/classifier'
import type { QuotaOptions, QuotaStore } from './quota'

export interface UpstashQuotaRedis {
  incr(key: string): Promise<number>
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

    const installKey = installUsageKey(installId)
    const installLimit = await this.installRatelimiter.limit(installKey)
    await installLimit.pending
    if (!installLimit.success) return false

    const classifications = await this.redis.incr(globalClassificationsKey())
    if (classifications > this.options.globalTier2Ceiling) return false

    const tokens = await this.redis.incrby(globalTokensKey(), estimatedTokens)
    return tokens <= this.options.globalTokenCeiling
  }

  async recordTier2(_installId: string, tokens: number, reservedTokens: number): Promise<void> {
    const adjustment = tokens - reservedTokens
    if (adjustment !== 0) await this.redis.incrby(globalTokensKey(), adjustment)
  }
}

export function createUpstashQuotaStore(options: {
  url: string
  token: string
  quota: QuotaOptions
}): UpstashQuotaStore {
  const redis = new Redis({ url: options.url, token: options.token })
  return new UpstashQuotaStore(
    redis,
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(
        Math.max(1, options.quota.perInstallTier2Quota),
        '1 d',
      ),
      prefix: 'serenity:ratelimit:tier2-per-install',
      ephemeralCache: false,
    }),
    options.quota,
  )
}

export function globalClassificationsKey(): string {
  return 'serenity:quota:global:tier2-classifications'
}

export function globalTokensKey(): string {
  return 'serenity:quota:global:tokens'
}

export function installUsageKey(installId: string): string {
  return sha256Hex(installId)
}

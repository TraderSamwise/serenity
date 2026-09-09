import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { sha256Hex } from '@serenity/classifier/runtime'

export interface RegisterLimiter {
  allow(request: Request): Promise<boolean>
}

export class MemoryRegisterLimiter implements RegisterLimiter {
  private readonly counts = new Map<string, number>()

  constructor(private readonly maxRegistrations: number) {}

  async allow(request: Request): Promise<boolean> {
    const key = registerLimiterKey(request)
    const next = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, next)
    return next <= this.maxRegistrations
  }
}

export interface UpstashRegisterRatelimiter {
  limit(identifier: string): Promise<{ success: boolean; pending: Promise<unknown> }>
}

export class UpstashRegisterLimiter implements RegisterLimiter {
  constructor(private readonly ratelimiter: UpstashRegisterRatelimiter) {}

  async allow(request: Request): Promise<boolean> {
    const result = await this.ratelimiter.limit(registerLimiterKey(request))
    await result.pending
    return result.success
  }
}

export function createUpstashRegisterLimiter(options: {
  url: string
  token: string
  maxRegistrationsPerIp: number
  keyPrefix?: string
}): UpstashRegisterLimiter {
  const redis = new Redis({ url: options.url, token: options.token })
  return new UpstashRegisterLimiter(
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(Math.max(1, options.maxRegistrationsPerIp), '1 h'),
      prefix: `${options.keyPrefix ?? 'serenity'}:ratelimit:register-per-ip`,
      ephemeralCache: false,
    }),
  )
}

export function registerLimiterKey(request: Request): string {
  const ip = request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  return sha256Hex(ip)
}

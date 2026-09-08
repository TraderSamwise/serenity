import {
  openAIClassifier,
  openAIModerationClient,
} from './classify'
import { createProxyApp } from './http'
import type { ProxyApp } from './http'
import { createUpstashGlobalHashCache } from './upstash-cache'
import { createUpstashQuotaStore } from './upstash-quota'

export interface ProxyConfig {
  apiKey: string
  tokenSecret: string
  upstashRedisRestUrl: string
  upstashRedisRestToken: string
  perInstallTier2Quota: number
  globalTier2Ceiling: number
  globalTokenCeiling: number
  tier2Enabled: boolean
  statsPath?: string
  port: number
}

export function loadProxyConfig(env = process.env): ProxyConfig {
  const missing = missingRequiredEnv(env, [
    'SERENITY_OPENAI_API_KEY',
    'SERENITY_PROXY_TOKEN_SECRET',
    'SERENITY_UPSTASH_REDIS_REST_URL',
    'SERENITY_UPSTASH_REDIS_REST_TOKEN',
  ])
  if (missing.length > 0) {
    throw new Error(
      `Missing proxy environment variables in packages/proxy/.env.local: ${missing.join(', ')}.`,
    )
  }

  const config: ProxyConfig = {
    apiKey: env.SERENITY_OPENAI_API_KEY!,
    tokenSecret: env.SERENITY_PROXY_TOKEN_SECRET!,
    upstashRedisRestUrl: env.SERENITY_UPSTASH_REDIS_REST_URL!,
    upstashRedisRestToken: env.SERENITY_UPSTASH_REDIS_REST_TOKEN!,
    perInstallTier2Quota: numberEnv(env.SERENITY_PROXY_PER_INSTALL_TIER2_QUOTA, 1000),
    globalTier2Ceiling: numberEnv(env.SERENITY_PROXY_GLOBAL_TIER2_CEILING, 100000),
    globalTokenCeiling: numberEnv(env.SERENITY_PROXY_GLOBAL_TOKEN_CEILING, 50000000),
    tier2Enabled: env.SERENITY_PROXY_TIER2_ENABLED !== '0',
    port: numberEnv(env.PORT, 8787),
  }
  if (env.SERENITY_PROXY_STATS_PATH !== undefined) config.statsPath = env.SERENITY_PROXY_STATS_PATH
  return config
}

export function createDefaultProxyApp(config: ProxyConfig): ProxyApp {
  const options = {
    tokenSecret: config.tokenSecret,
    deps: {
      cache: createUpstashGlobalHashCache({
        url: config.upstashRedisRestUrl,
        token: config.upstashRedisRestToken,
      }),
      quota: createUpstashQuotaStore({
        url: config.upstashRedisRestUrl,
        token: config.upstashRedisRestToken,
        quota: {
          perInstallTier2Quota: config.perInstallTier2Quota,
          globalTier2Ceiling: config.globalTier2Ceiling,
          globalTokenCeiling: config.globalTokenCeiling,
          tier2Enabled: config.tier2Enabled,
        },
      }),
      tier1: openAIModerationClient(config.apiKey),
      tier2: openAIClassifier(config.apiKey),
    },
  }
  return createProxyApp(
    config.statsPath === undefined ? options : { ...options, statsPath: config.statsPath },
  )
}

function missingRequiredEnv(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): string[] {
  return names.filter((name) => env[name] === undefined || env[name] === '')
}

function numberEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Numeric proxy environment variable must be a non-negative number.')
  }
  return parsed
}

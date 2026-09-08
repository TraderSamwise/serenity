import { resolve } from 'node:path'
import {
  openAIClassifier,
  openAIModerationClient,
} from './classify'
import { FileGlobalHashCache } from './hash-cache'
import { createProxyApp } from './http'
import type { ProxyApp } from './http'
import { FileQuotaStore } from './quota'

export interface ProxyConfig {
  apiKey: string
  tokenSecret: string
  cachePath: string
  quotaPath: string
  perInstallTier2Quota: number
  globalTier2Ceiling: number
  globalTokenCeiling: number
  tier2Enabled: boolean
  statsPath?: string
  port: number
}

export function loadProxyConfig(env = process.env): ProxyConfig {
  const config: ProxyConfig = {
    apiKey: required(env.SERENITY_OPENAI_API_KEY, 'SERENITY_OPENAI_API_KEY'),
    tokenSecret: required(env.SERENITY_PROXY_TOKEN_SECRET, 'SERENITY_PROXY_TOKEN_SECRET'),
    cachePath: env.SERENITY_PROXY_CACHE_PATH ?? resolve('data/global-cache.v1.json'),
    quotaPath: env.SERENITY_PROXY_QUOTA_PATH ?? resolve('data/quota.v1.json'),
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
      cache: new FileGlobalHashCache(config.cachePath),
      quota: new FileQuotaStore(config.quotaPath, {
        perInstallTier2Quota: config.perInstallTier2Quota,
        globalTier2Ceiling: config.globalTier2Ceiling,
        globalTokenCeiling: config.globalTokenCeiling,
        tier2Enabled: config.tier2Enabled,
      }),
      tier1: openAIModerationClient(config.apiKey),
      tier2: openAIClassifier(config.apiKey),
    },
  }
  return createProxyApp(
    config.statsPath === undefined ? options : { ...options, statsPath: config.statsPath },
  )
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}. Put it in packages/proxy/.env.local.`)
  }
  return value
}

function numberEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Numeric proxy environment variable must be a non-negative number.')
  }
  return parsed
}

import { sha256Hex } from '@serenity/classifier/runtime'

export interface UsageSnapshot {
  installs: Record<string, number>
  globalTier2Classifications: number
  globalTokens: number
}

export interface QuotaStore {
  reserveTier2(installId: string, estimatedTokens: number): Promise<boolean>
  recordTier2(installId: string, tokens: number, reservedTokens: number): Promise<void>
}

export interface QuotaOptions {
  perInstallTier2Quota: number
  globalTier2Ceiling: number
  globalTokenCeiling: number
  tier2Enabled: boolean
}

export function emptyUsageSnapshot(): UsageSnapshot {
  return {
    installs: {},
    globalTier2Classifications: 0,
    globalTokens: 0,
  }
}

export class MemoryQuotaStore implements QuotaStore {
  private readonly usage = emptyUsageSnapshot()

  constructor(private readonly options: QuotaOptions) {}

  async reserveTier2(installId: string, estimatedTokens: number): Promise<boolean> {
    if (!canUseTier2(this.usage, installId, estimatedTokens, this.options)) return false
    reserveTier2(this.usage, installId, estimatedTokens)
    return true
  }

  async recordTier2(_installId: string, tokens: number, reservedTokens: number): Promise<void> {
    recordTier2(this.usage, tokens, reservedTokens)
  }

  snapshot(): UsageSnapshot {
    return structuredClone(this.usage)
  }
}

function installUsageKey(installId: string): string {
  return sha256Hex(installId)
}

export function canUseTier2(
  usage: UsageSnapshot,
  installId: string,
  estimatedTokens: number,
  options: QuotaOptions,
): boolean {
  if (!options.tier2Enabled) return false
  if (usage.globalTier2Classifications >= options.globalTier2Ceiling) return false
  if (usage.globalTokens >= options.globalTokenCeiling) return false
  if (usage.globalTokens + estimatedTokens > options.globalTokenCeiling) return false

  const installKey = installUsageKey(installId)
  return (usage.installs[installKey] ?? 0) < options.perInstallTier2Quota
}

export function reserveTier2(
  usage: UsageSnapshot,
  installId: string,
  estimatedTokens: number,
): void {
  const installKey = installUsageKey(installId)
  usage.installs[installKey] = (usage.installs[installKey] ?? 0) + 1
  usage.globalTier2Classifications += 1
  usage.globalTokens += estimatedTokens
}

export function recordTier2(usage: UsageSnapshot, tokens: number, reservedTokens: number): void {
  usage.globalTokens = Math.max(0, usage.globalTokens + tokens - reservedTokens)
}

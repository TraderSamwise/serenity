import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sha256Hex } from '@serenity/classifier'

export interface UsageSnapshot {
  installs: Record<string, number>
  globalTier2Classifications: number
  globalTokens: number
}

export interface QuotaStore {
  canUseTier2(installId: string): Promise<boolean>
  recordTier2(installId: string, tokens: number): Promise<void>
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

  async canUseTier2(installId: string): Promise<boolean> {
    return canUseTier2(this.usage, installId, this.options)
  }

  async recordTier2(installId: string, tokens: number): Promise<void> {
    recordTier2(this.usage, installId, tokens)
  }

  snapshot(): UsageSnapshot {
    return structuredClone(this.usage)
  }
}

export class FileQuotaStore implements QuotaStore {
  private usage: UsageSnapshot | null = null

  constructor(
    private readonly path: string,
    private readonly options: QuotaOptions,
  ) {}

  async canUseTier2(installId: string): Promise<boolean> {
    return canUseTier2(await this.load(), installId, this.options)
  }

  async recordTier2(installId: string, tokens: number): Promise<void> {
    const usage = await this.load()
    recordTier2(usage, installId, tokens)
    await this.save(usage)
  }

  private async load(): Promise<UsageSnapshot> {
    if (this.usage !== null) return this.usage

    try {
      this.usage = JSON.parse(await readFile(this.path, 'utf8')) as UsageSnapshot
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.usage = emptyUsageSnapshot()
    }

    return this.usage
  }

  private async save(usage: UsageSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const tempPath = `${this.path}.tmp`
    await writeFile(tempPath, `${JSON.stringify(usage, null, 2)}\n`, 'utf8')
    await rename(tempPath, this.path)
  }
}

function installUsageKey(installId: string): string {
  return sha256Hex(installId)
}

function canUseTier2(
  usage: UsageSnapshot,
  installId: string,
  options: QuotaOptions,
): boolean {
  if (!options.tier2Enabled) return false
  if (usage.globalTier2Classifications >= options.globalTier2Ceiling) return false
  if (usage.globalTokens >= options.globalTokenCeiling) return false

  const installKey = installUsageKey(installId)
  return (usage.installs[installKey] ?? 0) < options.perInstallTier2Quota
}

function recordTier2(usage: UsageSnapshot, installId: string, tokens: number): void {
  const installKey = installUsageKey(installId)
  usage.installs[installKey] = (usage.installs[installKey] ?? 0) + 1
  usage.globalTier2Classifications += 1
  usage.globalTokens += tokens
}

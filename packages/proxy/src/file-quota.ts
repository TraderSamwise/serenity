import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  emptyUsageSnapshot,
  canUseTier2,
  recordTier2,
  reserveTier2,
} from './quota'
import type { QuotaOptions, QuotaStore, UsageSnapshot } from './quota'

export class FileQuotaStore implements QuotaStore {
  private usage: UsageSnapshot | null = null

  constructor(
    private readonly path: string,
    private readonly options: QuotaOptions,
  ) {}

  async reserveTier2(installId: string, estimatedTokens: number): Promise<boolean> {
    const usage = await this.load()
    if (!canUseTier2(usage, installId, estimatedTokens, this.options)) return false
    reserveTier2(usage, installId, estimatedTokens)
    await this.save(usage)
    return true
  }

  async recordTier2(_installId: string, tokens: number, reservedTokens: number): Promise<void> {
    const usage = await this.load()
    recordTier2(usage, tokens, reservedTokens)
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

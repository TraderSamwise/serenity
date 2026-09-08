import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Classification } from '@serenity/core'
import {
  emptyGlobalHashCacheSnapshot,
  type GlobalHashCache,
  type GlobalHashCacheSnapshot,
} from './hash-cache'

export class FileGlobalHashCache implements GlobalHashCache {
  private snapshot: GlobalHashCacheSnapshot | null = null

  constructor(private readonly path: string) {}

  async get(hash: string): Promise<Classification | undefined> {
    const snapshot = await this.load()
    return snapshot[hash]
  }

  async set(hash: string, classification: Classification): Promise<void> {
    const snapshot = await this.load()
    snapshot[hash] = classification
    await this.save(snapshot)
  }

  private async load(): Promise<GlobalHashCacheSnapshot> {
    if (this.snapshot !== null) return this.snapshot

    try {
      this.snapshot = JSON.parse(
        await readFile(this.path, 'utf8'),
      ) as GlobalHashCacheSnapshot
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.snapshot = emptyGlobalHashCacheSnapshot()
    }

    return this.snapshot
  }

  private async save(snapshot: GlobalHashCacheSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const tempPath = `${this.path}.tmp`
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    await rename(tempPath, this.path)
  }
}

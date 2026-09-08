import type { Classification } from '@serenity/core'
import { normaliseMessageText } from '@serenity/core'
import { sha256Hex } from '@serenity/classifier/runtime'

export type GlobalHashCacheSnapshot = Record<string, Classification>

export interface GlobalHashCache {
  get(hash: string): Promise<Classification | undefined>
  set(hash: string, classification: Classification): Promise<void>
}

export function textHash(text: string): string {
  return sha256Hex(normaliseMessageText(text))
}

export function emptyGlobalHashCacheSnapshot(): GlobalHashCacheSnapshot {
  return {}
}

export class MemoryGlobalHashCache implements GlobalHashCache {
  readonly entries = new Map<string, Classification>()

  async get(hash: string): Promise<Classification | undefined> {
    return this.entries.get(hash)
  }

  async set(hash: string, classification: Classification): Promise<void> {
    this.entries.set(hash, classification)
  }
}

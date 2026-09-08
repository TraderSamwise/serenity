import { createHash } from 'node:crypto'

export function normaliseMessageText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function cacheKeyForText(text: string): string {
  return sha256Hex(normaliseMessageText(text))
}

import { createHash } from 'node:crypto'
import { CLASSIFIER_RUBRIC_VERSION } from './prompt'

export function normaliseMessageText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function cacheKeyForText(
  text: string,
  rubricVersion = CLASSIFIER_RUBRIC_VERSION,
): string {
  return sha256Hex(`rubric:${rubricVersion}\ntext:${normaliseMessageText(text)}`)
}

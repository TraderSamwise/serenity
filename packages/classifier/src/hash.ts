import { createHash } from 'node:crypto'
import { normaliseMessageText } from '@serenity/core'
import { CLASSIFIER_RUBRIC_VERSION, RUBRIC_FIELD_VERSIONS } from './prompt'
import type { RubricField } from './prompt'

export { normaliseMessageText } from '@serenity/core'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function cacheKeyForText(
  text: string,
  rubricVersion = CLASSIFIER_RUBRIC_VERSION,
): string {
  return sha256Hex(`rubric:${rubricVersion}\ntext:${normaliseMessageText(text)}`)
}

export function fieldCacheKeyForText(
  text: string,
  field: RubricField,
  rubricVersion = RUBRIC_FIELD_VERSIONS[field],
): string {
  return sha256Hex(`field:${field}\nrubric:${rubricVersion}\ntext:${normaliseMessageText(text)}`)
}

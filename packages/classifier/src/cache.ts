import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { SCHEMA_VERSION } from '@serenity/core'
import type { Classification } from '@serenity/core'
import { cacheKeyForText, fieldCacheKeyForText } from './hash'
import {
  CLASSIFIER_MODEL,
  CLASSIFIER_OUTPUT_FIELDS,
  outputToClassification,
} from './schema'
import type { ClassifierOutput, ClassifierOutputField, PartialClassifierOutput } from './schema'
import { CLASSIFIER_RUBRIC_VERSION, RUBRIC_FIELD_VERSIONS } from './prompt'

export interface CorpusMessage {
  id: string
  text: string
  tags: string[]
}

export interface ClassificationCache {
  schemaVersion: number
  rubricVersion: number
  fieldRubricVersions: Record<ClassifierOutputField, number>
  model: string
  entries: Record<string, Classification>
  fieldEntries: Record<string, number>
  legacyEntries?: Record<string, Classification> | undefined
  legacyRubricVersion?: number | undefined
}

export type ClassifyFn = (
  message: CorpusMessage,
  fields: readonly ClassifierOutputField[],
) => Promise<PartialClassifierOutput>

export interface CorpusClassificationPlan {
  requests: Array<{ message: CorpusMessage; fields: ClassifierOutputField[] }>
  skipped: number
}

export function emptyClassificationCache(model = CLASSIFIER_MODEL): ClassificationCache {
  return {
    schemaVersion: SCHEMA_VERSION,
    rubricVersion: CLASSIFIER_RUBRIC_VERSION,
    fieldRubricVersions: RUBRIC_FIELD_VERSIONS,
    model,
    entries: {},
    fieldEntries: {},
  }
}

export async function readCorpusJsonl(path: string): Promise<CorpusMessage[]> {
  const contents = await readFile(path, 'utf8')
  return contents
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CorpusMessage)
}

export async function loadClassificationCache(path: string): Promise<ClassificationCache> {
  try {
    const cache = JSON.parse(await readFile(path, 'utf8')) as Partial<ClassificationCache>
    if (
      cache.schemaVersion !== SCHEMA_VERSION ||
      cache.model !== CLASSIFIER_MODEL
    ) {
      return emptyClassificationCache()
    }
    return {
      ...emptyClassificationCache(),
      entries: cache.rubricVersion === CLASSIFIER_RUBRIC_VERSION ? cache.entries ?? {} : {},
      fieldEntries: cache.fieldEntries ?? {},
      legacyEntries: cache.fieldEntries === undefined ? cache.entries : undefined,
      legacyRubricVersion: cache.fieldEntries === undefined ? cache.rubricVersion : undefined,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyClassificationCache()
    }
    throw error
  }
}

export async function saveClassificationCache(
  path: string,
  cache: ClassificationCache,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  const { legacyEntries: _legacyEntries, legacyRubricVersion: _legacyRubricVersion, ...stored } = cache
  await writeFile(tempPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}

export async function classifyMissingCorpusEntries(
  corpus: readonly CorpusMessage[],
  cache: ClassificationCache,
  cachePath: string,
  classify: ClassifyFn,
): Promise<{ classified: number; skipped: number }> {
  let classified = 0
  const plan = planMissingCorpusEntries(corpus, cache)

  for (const { message, fields } of plan.requests) {
    writeFields(message.text, await classify(message, fields), cache)
    assembleCurrentEntry(message.text, cache)
    classified += 1
    await saveClassificationCache(cachePath, cache)
  }

  return { classified, skipped: plan.skipped }
}

export function planMissingCorpusEntries(
  corpus: readonly CorpusMessage[],
  cache: ClassificationCache,
): CorpusClassificationPlan {
  let skipped = 0
  const requests: CorpusClassificationPlan['requests'] = []

  seedLegacyFields(corpus, cache)

  for (const message of corpus) {
    const fields = missingFieldsForText(message.text, cache)
    if (fields.length === 0) {
      assembleCurrentEntry(message.text, cache)
      skipped += 1
    } else {
      requests.push({ message, fields })
    }
  }

  return { requests, skipped }
}

function seedLegacyFields(corpus: readonly CorpusMessage[], cache: ClassificationCache): void {
  if (cache.legacyEntries === undefined || cache.legacyRubricVersion === undefined) return
  for (const message of corpus) {
    const legacy = cache.legacyEntries[cacheKeyForText(message.text, cache.legacyRubricVersion)]
    if (legacy === undefined) continue
    writeFields(message.text, classificationToOutput(legacy), cache, cache.legacyRubricVersion)
  }
  delete cache.legacyEntries
  delete cache.legacyRubricVersion
}

function missingFieldsForText(
  text: string,
  cache: ClassificationCache,
): ClassifierOutputField[] {
  return CLASSIFIER_OUTPUT_FIELDS.filter(
    (field) => cache.fieldEntries[fieldCacheKeyForText(text, field)] === undefined,
  )
}

function writeFields(
  text: string,
  output: PartialClassifierOutput,
  cache: ClassificationCache,
  rubricVersion?: number,
): void {
  for (const field of CLASSIFIER_OUTPUT_FIELDS) {
    const value = output[field]
    if (value !== undefined) {
      cache.fieldEntries[fieldCacheKeyForText(text, field, rubricVersion)] = value
    }
  }
}

function assembleCurrentEntry(text: string, cache: ClassificationCache): void {
  const output: PartialClassifierOutput = {}
  for (const field of CLASSIFIER_OUTPUT_FIELDS) {
    const value = cache.fieldEntries[fieldCacheKeyForText(text, field)]
    if (value === undefined) return
    output[field] = value
  }
  cache.entries[cacheKeyForText(text)] = outputToClassification(output as ClassifierOutput)
}

function classificationToOutput(classification: Classification): ClassifierOutput {
  return {
    ...classification.scores,
    sentiment: classification.sentiment,
    targeted: classification.targeted,
    confidence: classification.confidence,
  }
}

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { SCHEMA_VERSION } from '../../core/src/index'
import type { Classification } from '../../core/src/index'
import { cacheKeyForText } from './hash'
import { CLASSIFIER_MODEL } from './schema'

export interface CorpusMessage {
  id: string
  text: string
  tags: string[]
}

export interface ClassificationCache {
  schemaVersion: number
  model: string
  entries: Record<string, Classification>
}

export type ClassifyFn = (message: CorpusMessage) => Promise<Classification>

export function emptyClassificationCache(model = CLASSIFIER_MODEL): ClassificationCache {
  return { schemaVersion: SCHEMA_VERSION, model, entries: {} }
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
    return JSON.parse(await readFile(path, 'utf8')) as ClassificationCache
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
  await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}

export async function classifyMissingCorpusEntries(
  corpus: readonly CorpusMessage[],
  cache: ClassificationCache,
  cachePath: string,
  classify: ClassifyFn,
): Promise<{ classified: number; skipped: number }> {
  let classified = 0
  let skipped = 0

  for (const message of corpus) {
    const key = cacheKeyForText(message.text)
    if (cache.entries[key] !== undefined) {
      skipped += 1
      continue
    }

    cache.entries[key] = await classify(message)
    classified += 1
    await saveClassificationCache(cachePath, cache)
  }

  return { classified, skipped }
}

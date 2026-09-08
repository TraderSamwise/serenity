import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { sourceCorpusMessages } from './corpus-source'

const CORPUS_PATH = resolve('fixtures/corpus.jsonl')

const source = sourceCorpusMessages()
const corpusLines = source.map(({ id, text, tags }) => JSON.stringify({ id, text, tags }))

await mkdir(dirname(CORPUS_PATH), { recursive: true })
await writeFile(CORPUS_PATH, `${corpusLines.join('\n')}\n`, 'utf8')

console.log(`wrote ${source.length} corpus messages`)

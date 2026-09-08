import { resolve } from 'node:path'
import {
  classifyMissingCorpusEntries,
  loadClassificationCache,
  readCorpusJsonl,
} from './cache'
import { classifyFieldsWithOpenAIResult } from './openai'

const CORPUS_PATH = resolve('fixtures/corpus.jsonl')
const CACHE_PATH = resolve('fixtures/classification-cache.v1.json')
const DEFAULT_INSTALL_ID = 'serenity-fixture-corpus-v1'

async function main(): Promise<void> {
  const apiKey = process.env.SERENITY_OPENAI_API_KEY
  if (!apiKey) {
    console.error(
      'Missing OpenAI API key. Put SERENITY_OPENAI_API_KEY in packages/classifier/.env.local.',
    )
    process.exitCode = 1
    return
  }

  const corpus = await readCorpusJsonl(CORPUS_PATH)
  const cache = await loadClassificationCache(CACHE_PATH)
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const started = Date.now()
  const result = await classifyMissingCorpusEntries(corpus, cache, CACHE_PATH, async (message, fields) => {
    const response = await classifyFieldsWithOpenAIResult(message, {
      apiKey,
      installId: process.env.SERENITY_INSTALL_ID ?? DEFAULT_INSTALL_ID,
      fields,
    })
    usage.inputTokens += response.usage.input_tokens
    usage.outputTokens += response.usage.output_tokens
    usage.totalTokens += response.usage.total_tokens
    return response.output
  })
  const wallClockSeconds = (Date.now() - started) / 1000

  console.log(
    [
      `classified=${result.classified}`,
      `skipped=${result.skipped}`,
      `total=${corpus.length}`,
      `input_tokens=${usage.inputTokens}`,
      `output_tokens=${usage.outputTokens}`,
      `total_tokens=${usage.totalTokens}`,
      `wall_clock_seconds=${wallClockSeconds.toFixed(1)}`,
      `cache=${CACHE_PATH}`,
    ].join(' '),
  )
}

await main()

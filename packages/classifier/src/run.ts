import { resolve } from 'node:path'
import {
  classifyMissingCorpusEntries,
  loadClassificationCache,
  readCorpusJsonl,
} from './cache'
import { classifyWithOpenAIResult } from './openai'

const CORPUS_PATH = resolve('fixtures/corpus.jsonl')
const CACHE_PATH = resolve('fixtures/classification-cache.v1.json')
const DEFAULT_INSTALL_ID = 'serenity-fixture-corpus-v1'
const INPUT_PRICE_PER_MILLION = 0.25
const OUTPUT_PRICE_PER_MILLION = 2

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
  const result = await classifyMissingCorpusEntries(corpus, cache, CACHE_PATH, async (message) => {
    const response = await classifyWithOpenAIResult(message, {
      apiKey,
      installId: process.env.SERENITY_INSTALL_ID ?? DEFAULT_INSTALL_ID,
    })
    usage.inputTokens += response.usage.input_tokens
    usage.outputTokens += response.usage.output_tokens
    usage.totalTokens += response.usage.total_tokens
    return response.classification
  })
  const wallClockSeconds = (Date.now() - started) / 1000
  const cost =
    (usage.inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION +
    (usage.outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION

  console.log(
    [
      `classified=${result.classified}`,
      `skipped=${result.skipped}`,
      `total=${corpus.length}`,
      `input_tokens=${usage.inputTokens}`,
      `output_tokens=${usage.outputTokens}`,
      `total_tokens=${usage.totalTokens}`,
      `estimated_cost_usd=${cost.toFixed(6)}`,
      `wall_clock_seconds=${wallClockSeconds.toFixed(1)}`,
      `cache=${CACHE_PATH}`,
    ].join(' '),
  )
}

await main()

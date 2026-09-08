import { buildClassifierSystemPrompt, buildClassifierUserPrompt } from './prompt'
import type { RubricField } from './prompt'
import type { CorpusMessage } from './cache'

export const OPENAI_PRICING_CHECKED_AT = '2026-09-08'
export const OPENAI_PRICING_SOURCE_URL = 'https://developers.openai.com/api/docs/models/gpt-5-mini'
// Re-check before changing the classifier model or using projections for a new budget.
export const GPT_5_MINI_INPUT_USD_PER_MILLION = 0.25
export const GPT_5_MINI_CACHED_INPUT_USD_PER_MILLION = 0.025
export const GPT_5_MINI_OUTPUT_USD_PER_MILLION = 2.0
export const GPT_5_MINI_MIN_CACHEABLE_PREFIX_TOKENS = 2_048

export interface TokenUsageEstimate {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export interface CostEstimate extends TokenUsageEstimate {
  estimatedCostUsd: number
}

export interface ClassificationProjectionItem {
  message: CorpusMessage
  fields: readonly RubricField[]
}

export function estimateRunCost(items: readonly ClassificationProjectionItem[]): CostEstimate {
  const inputTokensByPrompt = new Map<string, number>()
  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0

  for (const item of items) {
    const systemPrompt = buildClassifierSystemPrompt(item.fields)
    const systemPromptTokens = estimateTokens(systemPrompt)
    const userPromptTokens = estimateTokens(buildClassifierUserPrompt(item.message.text))
    const promptKey = item.fields.join(',')

    inputTokens += systemPromptTokens + userPromptTokens
    outputTokens += estimateOutputTokens(item.fields)
    if (
      inputTokensByPrompt.has(promptKey) &&
      systemPromptTokens >= GPT_5_MINI_MIN_CACHEABLE_PREFIX_TOKENS
    ) {
      cachedInputTokens += systemPromptTokens
    }
    inputTokensByPrompt.set(promptKey, systemPromptTokens)
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    estimatedCostUsd: estimateOpenAICostUsd({ inputTokens, cachedInputTokens, outputTokens }),
  }
}

export function estimateOpenAICostUsd(usage: TokenUsageEstimate): number {
  const cachedInputTokens = Math.min(usage.cachedInputTokens, usage.inputTokens)
  const uncachedInputTokens = usage.inputTokens - cachedInputTokens
  return (
    (uncachedInputTokens / 1_000_000) * GPT_5_MINI_INPUT_USD_PER_MILLION +
    (cachedInputTokens / 1_000_000) * GPT_5_MINI_CACHED_INPUT_USD_PER_MILLION +
    (usage.outputTokens / 1_000_000) * GPT_5_MINI_OUTPUT_USD_PER_MILLION
  )
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

function estimateOutputTokens(fields: readonly RubricField[]): number {
  const sample = Object.fromEntries(fields.map((field) => [field, 0.55]))
  return estimateTokens(JSON.stringify(sample))
}

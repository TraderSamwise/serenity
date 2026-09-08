import {
  classifyWithLocalHeuristics,
  hiddenByMostPermissiveHandling,
} from '@serenity/core'
import type { Classification, ProxyClassifyResult } from '@serenity/core'
import { classifyWithOpenAIResult } from '@serenity/classifier'
import type { OpenAIUsage } from '@serenity/classifier'
import { textHash } from './hash-cache'
import type { GlobalHashCache } from './hash-cache'
import {
  classificationFromModeration,
  moderateWithOpenAI,
} from './moderation'
import type { Tier1ModerationResult } from './moderation'
import type { QuotaStore } from './quota'

export interface Tier1Client {
  moderate(text: string, installId: string): Promise<Tier1ModerationResult>
}

export interface Tier2Classifier {
  classify(text: string, installId: string): Promise<{
    classification: Classification
    usage: OpenAIUsage
  }>
}

export interface ClassifyDependencies {
  cache: GlobalHashCache
  quota: QuotaStore
  tier1: Tier1Client
  tier2: Tier2Classifier
}

export interface ClassifyBatchResult {
  results: ProxyClassifyResult[]
  stats: ClassifyBatchStats
}

export interface ClassifyBatchStats {
  messages: number
  globalCacheHits: number
  localShortCircuits: number
  tier1ShortCircuits: number
  tier2Classifications: number
  freeTierFallbacks: number
  usage: {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export function openAIModerationClient(apiKey: string): Tier1Client {
  return {
    async moderate(text, installId) {
      return moderateWithOpenAI(text, { apiKey, installId })
    },
  }
}

export function openAIClassifier(apiKey: string): Tier2Classifier {
  return {
    async classify(text, installId) {
      return classifyWithOpenAIResult(
        { id: textHash(text), text, tags: [] },
        { apiKey, installId },
      )
    },
  }
}

export async function classifyBatch(
  messages: readonly string[],
  installId: string,
  deps: ClassifyDependencies,
): Promise<ClassifyBatchResult> {
  const results: ProxyClassifyResult[] = []
  const stats = emptyClassifyBatchStats(messages.length)

  for (const text of messages) {
    results.push(await classifyOne(text, installId, deps, stats))
  }

  return { results, stats }
}

async function classifyOne(
  text: string,
  installId: string,
  deps: ClassifyDependencies,
  stats: ClassifyBatchStats,
): Promise<ProxyClassifyResult> {
  const hash = textHash(text)
  const cached = await deps.cache.get(hash)
  if (cached !== undefined) {
    stats.globalCacheHits += 1
    return classified(cached)
  }

  const local = classifyWithLocalHeuristics(text)
  if (local !== null && hiddenByMostPermissiveHandling(local)) {
    stats.localShortCircuits += 1
    return { status: 'hidden', reason: 'tier0_local_heuristic' }
  }

  const moderation = await deps.tier1.moderate(text, installId)
  const tier1Classification = classificationFromModeration(moderation)
  if (
    tier1Classification !== null &&
    hiddenByMostPermissiveHandling(tier1Classification)
  ) {
    stats.tier1ShortCircuits += 1
    return { status: 'hidden', reason: 'tier1_moderation' }
  }

  if (await deps.quota.canUseTier2(installId)) {
    const tier2 = await deps.tier2.classify(text, installId)
    await deps.cache.set(hash, tier2.classification)
    await deps.quota.recordTier2(installId, tier2.usage.total_tokens)
    stats.tier2Classifications += 1
    stats.usage.inputTokens += tier2.usage.input_tokens
    stats.usage.cachedInputTokens += tier2.usage.input_tokens_details?.cached_tokens ?? 0
    stats.usage.outputTokens += tier2.usage.output_tokens
    stats.usage.totalTokens += tier2.usage.total_tokens
    return classified(tier2.classification)
  }

  stats.freeTierFallbacks += 1
  return { status: 'unclassified', reason: 'quota_exhausted' }
}

function classified(classification: Classification): ProxyClassifyResult {
  return { status: 'classified', classification }
}

function emptyClassifyBatchStats(messages: number): ClassifyBatchStats {
  return {
    messages,
    globalCacheHits: 0,
    localShortCircuits: 0,
    tier1ShortCircuits: 0,
    tier2Classifications: 0,
    freeTierFallbacks: 0,
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  }
}

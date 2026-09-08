import type { Classification } from '@serenity/core'
import { classifyWithOpenAIResult } from '@serenity/classifier'
import type { OpenAIUsage } from '@serenity/classifier'
import { textHash } from './hash-cache'
import type { GlobalHashCache } from './hash-cache'
import { classifyWithLocalHeuristics } from './local-heuristics'
import {
  classificationFromModeration,
  hiddenByMostPermissiveHandling,
  moderateWithOpenAI,
} from './moderation'
import type { Tier1ModerationResult } from './moderation'
import type { QuotaStore } from './quota'
import { cleanClassification } from './vector'

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
  classifications: Classification[]
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
  const classifications: Classification[] = []

  for (const text of messages) {
    classifications.push(await classifyOne(text, installId, deps))
  }

  return { classifications }
}

async function classifyOne(
  text: string,
  installId: string,
  deps: ClassifyDependencies,
): Promise<Classification> {
  const hash = textHash(text)
  const cached = await deps.cache.get(hash)
  if (cached !== undefined) return cached

  const local = classifyWithLocalHeuristics(text)
  if (local !== null && hiddenByMostPermissiveHandling(local)) {
    return local
  }

  const moderation = await deps.tier1.moderate(text, installId)
  const tier1Classification = classificationFromModeration(moderation)
  if (
    tier1Classification !== null &&
    hiddenByMostPermissiveHandling(tier1Classification)
  ) {
    return tier1Classification
  }

  if (await deps.quota.canUseTier2(installId)) {
    const tier2 = await deps.tier2.classify(text, installId)
    await deps.cache.set(hash, tier2.classification)
    await deps.quota.recordTier2(installId, tier2.usage.total_tokens)
    return tier2.classification
  }

  return cleanClassification()
}

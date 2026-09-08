import { sha256Hex } from '@serenity/classifier/runtime'
import type { Classification, ScoredAxis } from '@serenity/core'
import { classificationWithScores, MODERATION_MODEL } from './vector'

type Fetch = typeof fetch

export interface Tier1ModerationResult {
  flagged: boolean
  categories: Record<string, boolean>
  categoryScores: Record<string, number>
}

interface ModerationApiResult {
  results: [
    {
      flagged: boolean
      categories: Record<string, boolean>
      category_scores: Record<string, number>
    },
  ]
}

export async function moderateWithOpenAI(
  text: string,
  options: { apiKey: string; installId: string; fetchImpl?: Fetch },
): Promise<Tier1ModerationResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODERATION_MODEL,
      input: text,
      safety_identifier: sha256Hex(options.installId),
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI moderation request failed with HTTP ${response.status}.`)
  }

  const result = (await response.json()) as ModerationApiResult
  const first = result.results[0]
  if (first === undefined) throw new Error('OpenAI moderation response was empty.')

  return {
    flagged: first.flagged,
    categories: first.categories,
    categoryScores: first.category_scores,
  }
}

export function classificationFromModeration(
  moderation: Tier1ModerationResult,
): Classification | null {
  if (!moderation.flagged) return null

  const scores: Partial<Record<ScoredAxis, number>> = {}
  if (moderation.categories.harassment) scores.insult = 1
  if (moderation.categories['harassment/threatening']) scores.threat = 1
  if (moderation.categories.hate) scores.identity_attack = 1
  if (moderation.categories['hate/threatening']) {
    scores.identity_attack = 1
    scores.threat = 1
  }
  if (moderation.categories.sexual) scores.sexual_explicit = 1
  if (moderation.categories['sexual/minors']) {
    scores.sexual_explicit = 1
    scores.sexual_violent = 1
  }
  if (moderation.categories['self-harm/instructions']) scores.self_harm_directed = 1
  if (moderation.categories.violence || moderation.categories['violence/graphic']) {
    scores.threat = 1
  }

  if (Object.keys(scores).length === 0) return null
  return classificationWithScores(scores, MODERATION_MODEL)
}

import {
  HARM_AXES,
  PROTECTIVE_AXES,
  SCHEMA_VERSION,
} from '@serenity/core'
import type { Classification, ScoredAxis } from '@serenity/core'

export const FREE_TIER_MODEL = 'serenity-free-tiers-v1'
export const LOCAL_HEURISTICS_MODEL = 'serenity-local-heuristics-v1'
export const MODERATION_MODEL = 'omni-moderation-latest'

export function cleanClassification(model = FREE_TIER_MODEL): Classification {
  const scores = Object.fromEntries(
    [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, 0]),
  ) as Record<ScoredAxis, number>

  return {
    model,
    schema: SCHEMA_VERSION,
    sentiment: 0,
    targeted: 1,
    confidence: 1,
    scores,
  }
}

export function classificationWithScores(
  scores: Partial<Record<ScoredAxis, number>>,
  model: string,
): Classification {
  return {
    ...cleanClassification(model),
    sentiment: Object.values(scores).some((score) => score > 0) ? -1 : 0,
    scores: {
      ...cleanClassification(model).scores,
      ...scores,
    },
  }
}

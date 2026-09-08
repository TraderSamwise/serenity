import { HARM_AXES, PROTECTIVE_AXES, SCHEMA_VERSION } from '@serenity/core'
import type { Classification, ScoredAxis } from '@serenity/core'
import { CLASSIFIER_MODEL } from '@serenity/classifier'

export function classification(
  scores: Partial<Record<ScoredAxis, number>> = {},
): Classification {
  const cleanScores = Object.fromEntries(
    [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, 0]),
  ) as Record<ScoredAxis, number>

  return {
    model: CLASSIFIER_MODEL,
    schema: SCHEMA_VERSION,
    sentiment: 0,
    targeted: 1,
    confidence: 1,
    scores: { ...cleanScores, ...scores },
  }
}

export function moderation(categories: Record<string, boolean>) {
  return {
    flagged: Object.values(categories).some(Boolean),
    categories,
    categoryScores: Object.fromEntries(
      Object.keys(categories).map((category) => [category, categories[category] ? 1 : 0]),
    ),
  }
}

import {
  HARM_AXES,
  PROTECTIVE_AXES,
  SCHEMA_VERSION,
} from '@serenity/core'
import type { Classification, ScoredAxis } from '@serenity/core'

export function classification(
  scores: Partial<Record<ScoredAxis, number>> = {},
): Classification {
  const cleanScores = Object.fromEntries(
    [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, 0]),
  ) as Record<ScoredAxis, number>

  return {
    model: 'test-model-2026-09-08',
    schema: SCHEMA_VERSION,
    sentiment: 0,
    targeted: 1,
    confidence: 1,
    scores: { ...cleanScores, ...scores },
  }
}

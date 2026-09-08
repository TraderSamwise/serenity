import {
  HARM_AXES,
  PROTECTIVE_AXES,
  SCHEMA_VERSION,
} from './axes'
import type { Classification, ScoredAxis } from './axes'
import { PRESETS, SITE_PROFILES, rulesetFor } from './presets'
import { evaluate } from './ruleset'
import { LOCAL_HEURISTIC_RULES } from './local-heuristics-data'

export const LOCAL_HEURISTICS_MODEL = 'serenity-local-heuristics-v1'

const COMPILED_LOCAL_HEURISTICS = LOCAL_HEURISTIC_RULES.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.pattern, 'i'),
}))

export function classifyWithLocalHeuristics(text: string): Classification | null {
  const rule = COMPILED_LOCAL_HEURISTICS.find((candidate) => candidate.regex.test(text))
  if (rule === undefined) return null
  return classificationWithScores({ [rule.axis]: 1 }, LOCAL_HEURISTICS_MODEL)
}

export function hiddenByMostPermissiveHandling(classification: Classification): boolean {
  return [SITE_PROFILES.standard, SITE_PROFILES.nsfw].every((profile) =>
    evaluate(classification, rulesetFor(PRESETS.balanced, profile)).hide,
  )
}

export function classificationWithScores(
  scores: Partial<Record<ScoredAxis, number>>,
  model: string,
): Classification {
  const cleanScores = Object.fromEntries(
    [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, 0]),
  ) as Record<ScoredAxis, number>

  return {
    model,
    schema: SCHEMA_VERSION,
    sentiment: Object.values(scores).some((score) => score > 0) ? -1 : 0,
    targeted: 1,
    confidence: 1,
    scores: {
      ...cleanScores,
      ...scores,
    },
  }
}

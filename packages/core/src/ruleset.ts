import {
  AXIS_DEFINITIONS,
  HARM_AXES,
  OVERRIDE_AXES,
} from './axes'
import type { Classification, HarmAxis, OverrideAxis } from './axes'

export const SEVERE_AXES = [
  'threat',
  'coercion',
  'sexual_violent',
  'self_harm_directed',
] as const satisfies readonly HarmAxis[]

export interface Ruleset {
  name: string
  thresholds: Readonly<Partial<Record<HarmAxis, number>>>
  ignore?: readonly HarmAxis[]
  protectFloor: number
}

export type VerdictReason =
  | { kind: 'harm'; axis: HarmAxis; score: number; threshold: number }
  | { kind: 'protected'; axis: OverrideAxis; score: number }
  | { kind: 'clean' }

export interface Verdict {
  hide: boolean
  reason: VerdictReason
  /** Human-readable, for the audit log only. Never shown beside the message. */
  explain: string
}

function protectedBy(c: Classification, rules: Ruleset): OverrideAxis | null {
  for (const axis of OVERRIDE_AXES) {
    if (c.scores[axis] >= rules.protectFloor) return axis
  }
  return null
}

function firstSevere(c: Classification, rules: Ruleset): HarmAxis | null {
  for (const axis of SEVERE_AXES) {
    const threshold = rules.thresholds[axis]
    if (threshold !== undefined && c.scores[axis] >= threshold) return axis
  }
  return null
}

export function evaluate(c: Classification, rules: Ruleset): Verdict {
  const severe = firstSevere(c, rules)
  if (severe) {
    return {
      hide: true,
      reason: {
        kind: 'harm',
        axis: severe,
        score: c.scores[severe],
        threshold: rules.thresholds[severe]!,
      },
      explain: `${severe}: ${AXIS_DEFINITIONS[severe]}`,
    }
  }

  const protection = protectedBy(c, rules)
  if (protection) {
    return {
      hide: false,
      reason: { kind: 'protected', axis: protection, score: c.scores[protection] },
      explain: `kept: ${AXIS_DEFINITIONS[protection]}`,
    }
  }

  for (const axis of HARM_AXES) {
    if (rules.ignore?.includes(axis)) continue
    const threshold = rules.thresholds[axis]
    if (threshold !== undefined && c.scores[axis] >= threshold) {
      return {
        hide: true,
        reason: { kind: 'harm', axis, score: c.scores[axis], threshold },
        explain: `${axis}: ${AXIS_DEFINITIONS[axis]}`,
      }
    }
  }

  return { hide: false, reason: { kind: 'clean' }, explain: 'no axis fired' }
}

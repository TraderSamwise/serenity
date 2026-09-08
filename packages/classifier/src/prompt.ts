import { AXIS_DEFINITIONS, SCORED_AXES } from '@serenity/core'
import type { ScoredAxis } from '@serenity/core'

export const CLASSIFIER_RUBRIC_VERSION = 6

export const METRIC_RUBRIC_FIELDS = ['sentiment', 'targeted', 'confidence'] as const

export type MetricRubricField = (typeof METRIC_RUBRIC_FIELDS)[number]
export type RubricField = ScoredAxis | MetricRubricField

export const RUBRIC_FIELD_VERSIONS: Record<RubricField, number> = {
  insult: 5,
  threat: 5,
  coercion: 6,
  identity_attack: 5,
  appearance_attack: 5,
  sexual_explicit: 5,
  sexual_degrading: 5,
  sexual_violent: 5,
  self_harm_directed: 5,
  parasocial_intensity: 5,
  spam_scam: 5,
  business_inquiry: 5,
  transactional: 5,
  legal_notice: 5,
  self_harm_disclosure: 5,
  minor_indicators: 5,
  sentiment: 5,
  targeted: 5,
  confidence: 5,
}

export function buildClassifierSystemPrompt(
  fields: readonly RubricField[] = [...SCORED_AXES, ...METRIC_RUBRIC_FIELDS],
): string {
  const axisFields = SCORED_AXES.filter((axis) => fields.includes(axis))
  const rubric = axisFields.map(
    (axis) => `- ${axis}: ${AXIS_DEFINITIONS[axis]}`,
  ).join('\n')
  const metricFields = METRIC_RUBRIC_FIELDS.filter((field) => fields.includes(field))

  return [
    'You produce descriptive numeric scores for inbound creator messages.',
    'Describe what is present in the text using the supplied taxonomy.',
    'Do not decide what the product does with the message.',
    'Score each requested taxonomy axis from 0 to 1. Use 0 when absent, 1 when unmistakably present.',
    'Use the full score range; do not compress present signals toward 0.',
    'Treat contrastive examples in the taxonomy as calibration anchors.',
    'Examples marked low or low contrast should score 0 to 0.2 on that axis.',
    'Examples marked middle-band should score 0.3 to 0.45 on that axis.',
    'Examples marked high should usually score at least 0.7 on that axis.',
    ...metricInstructions(metricFields),
    'For sexual_explicit, count explicit adult-content references, nudity, topless/nude content, sex scenes, dirty talk, sexual propositions, and sex-act descriptions.',
    '',
    'Taxonomy:',
    rubric,
  ].join('\n')
}

export function buildClassifierUserPrompt(text: string): string {
  return ['Inbound message:', text].join('\n')
}

function metricInstructions(fields: readonly MetricRubricField[]): string[] {
  const instructions: string[] = []
  if (fields.includes('sentiment')) {
    instructions.push('Score sentiment from -1 to 1, where -1 is hostile toward the recipient and 1 is warm.')
  }
  if (fields.includes('targeted')) {
    instructions.push('Score targeted from 0 to 1, where 1 means directed at the recipient.')
  }
  if (fields.includes('confidence')) {
    instructions.push('Score confidence from 0 to 1 for the requested fields.')
    instructions.push('High confidence means the vector is clear, even when all taxonomy axes are absent.')
    instructions.push('Do not lower confidence merely because the message is mild, critical, or non-abusive.')
  }
  return instructions
}

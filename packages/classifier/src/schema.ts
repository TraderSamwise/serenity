import {
  AXIS_DEFINITIONS,
  SCHEMA_VERSION,
  SCORED_AXES,
} from '../../core/src/index'
import type { Classification, ScoredAxis } from '../../core/src/index'

export const CLASSIFIER_MODEL = 'gpt-5-mini-2025-08-07'

const METRIC_FIELDS = ['sentiment', 'targeted', 'confidence'] as const

export type ClassifierMetricField = (typeof METRIC_FIELDS)[number]
export type ClassifierOutput = Record<ScoredAxis, number> &
  Record<ClassifierMetricField, number>

type JsonSchemaProperty = {
  type: 'number'
  minimum: number
  maximum: number
  description: string
}

type JsonSchema = {
  type: 'object'
  additionalProperties: false
  required: readonly string[]
  properties: Record<string, JsonSchemaProperty>
}

const axisProperties = Object.fromEntries(
  SCORED_AXES.map((axis) => [
    axis,
    {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: AXIS_DEFINITIONS[axis],
    },
  ]),
) as Record<ScoredAxis, JsonSchemaProperty>

export const CLASSIFIER_OUTPUT_FIELDS = [...SCORED_AXES, ...METRIC_FIELDS] as const

export const CLASSIFIER_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: CLASSIFIER_OUTPUT_FIELDS,
  properties: {
    ...axisProperties,
    sentiment: {
      type: 'number',
      minimum: -1,
      maximum: 1,
      description: '-1 is hostile toward the recipient, 0 is neutral, 1 is warm.',
    },
    targeted: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: '0 is about others or the world, 1 is directed at the recipient.',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Model confidence in the full descriptive vector.',
    },
  },
}

export function outputToClassification(
  output: ClassifierOutput,
  model = CLASSIFIER_MODEL,
): Classification {
  const scores = Object.fromEntries(
    SCORED_AXES.map((axis) => [axis, output[axis]]),
  ) as Record<ScoredAxis, number>

  return {
    model,
    schema: SCHEMA_VERSION,
    sentiment: output.sentiment,
    targeted: output.targeted,
    confidence: output.confidence,
    scores,
  }
}

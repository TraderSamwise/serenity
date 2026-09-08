import {
  AXIS_DEFINITIONS,
  SCHEMA_VERSION,
  SCORED_AXES,
} from '@serenity/core'
import type { Classification, ScoredAxis } from '@serenity/core'

export const CLASSIFIER_MODEL = 'gpt-5-mini-2025-08-07'

export const METRIC_FIELDS = ['sentiment', 'targeted', 'confidence'] as const

export type ClassifierMetricField = (typeof METRIC_FIELDS)[number]
export type ClassifierOutputField = ScoredAxis | ClassifierMetricField
export type ClassifierOutput = Record<ScoredAxis, number> &
  Record<ClassifierMetricField, number>
export type PartialClassifierOutput = Partial<Record<ClassifierOutputField, number>>

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

const metricProperties: Record<ClassifierMetricField, JsonSchemaProperty> = {
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
    description: 'Model confidence in the requested descriptive fields.',
  },
}

export function classifierJsonSchemaForFields(
  fields: readonly ClassifierOutputField[] = CLASSIFIER_OUTPUT_FIELDS,
): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: fields,
    properties: Object.fromEntries(
      fields.map((field) => [
        field,
        field in axisProperties
          ? axisProperties[field as ScoredAxis]
          : metricProperties[field as ClassifierMetricField],
      ]),
    ) as Record<string, JsonSchemaProperty>,
  }
}

export const CLASSIFIER_JSON_SCHEMA: JsonSchema = classifierJsonSchemaForFields()

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

import { describe, expect, it } from 'vitest'
import { AXIS_DEFINITIONS, SCORED_AXES } from '@serenity/core'
import { CLASSIFIER_JSON_SCHEMA, CLASSIFIER_OUTPUT_FIELDS } from '../src/schema'

describe('classifier schema', () => {
  it('requires every scored axis and metric with strict object shape', () => {
    expect(CLASSIFIER_JSON_SCHEMA.additionalProperties).toBe(false)
    expect(CLASSIFIER_JSON_SCHEMA.required).toEqual(CLASSIFIER_OUTPUT_FIELDS)
    expect(CLASSIFIER_JSON_SCHEMA.required).toEqual([
      ...SCORED_AXES,
      'sentiment',
      'targeted',
      'confidence',
    ])
  })

  it('derives scored-axis descriptions from core taxonomy definitions', () => {
    for (const axis of SCORED_AXES) {
      expect(CLASSIFIER_JSON_SCHEMA.properties[axis]).toMatchObject({
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: AXIS_DEFINITIONS[axis],
      })
    }

    expect(CLASSIFIER_JSON_SCHEMA.properties.sentiment).toMatchObject({
      minimum: -1,
      maximum: 1,
    })
  })
})

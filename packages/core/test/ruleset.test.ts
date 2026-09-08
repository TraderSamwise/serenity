import { describe, expect, it } from 'vitest'
import { HARM_AXES, PROTECTIVE_AXES, SCHEMA_VERSION } from '../src/axes'
import type { Classification, ScoredAxis } from '../src/axes'
import { DEFAULT_PRESET, PRESETS, SITE_PROFILES, rulesetFor } from '../src/presets'
import { evaluate } from '../src/ruleset'

type ClassificationOverrides = Partial<Omit<Classification, 'scores'>> & {
  scores?: Partial<Record<ScoredAxis, number>>
}

function cleanClassification(overrides: ClassificationOverrides = {}): Classification {
  const scores = Object.fromEntries(
    [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, 0]),
  ) as Record<ScoredAxis, number>
  const { scores: scoreOverrides, ...classificationOverrides } = overrides

  return {
    model: 'test-model-2026-09-08',
    schema: SCHEMA_VERSION,
    sentiment: 0.2,
    targeted: 1,
    confidence: 0.99,
    ...classificationOverrides,
    scores: { ...scores, ...scoreOverrides },
  }
}

describe('evaluate', () => {
  it('hides severe axes before protective business signals', () => {
    const verdict = evaluate(
      cleanClassification({
        scores: {
          threat: 0.9,
          business_inquiry: 0.95,
        },
      }),
      DEFAULT_PRESET,
    )

    expect(verdict.hide).toBe(true)
    expect(verdict.reason).toMatchObject({ kind: 'harm', axis: 'threat' })
  })

  it('protective override keeps non-severe harm visible', () => {
    const verdict = evaluate(
      cleanClassification({
        scores: {
          insult: 0.9,
          business_inquiry: 0.95,
        },
      }),
      DEFAULT_PRESET,
    )

    expect(verdict.hide).toBe(false)
    expect(verdict.reason).toMatchObject({ kind: 'protected', axis: 'business_inquiry' })
  })

  it('minor indicators do not override non-severe harm', () => {
    const verdict = evaluate(
      cleanClassification({
        scores: {
          minor_indicators: 1,
          sexual_explicit: 0.95,
        },
      }),
      DEFAULT_PRESET,
    )

    expect(verdict.hide).toBe(true)
    expect(verdict.reason).toMatchObject({ kind: 'harm', axis: 'sexual_explicit' })
  })

  it('site ignore list suppresses only the named axis', () => {
    const nsfwAggressive = rulesetFor(PRESETS.aggressive, SITE_PROFILES.nsfw)

    const explicit = evaluate(
      cleanClassification({
        scores: { sexual_explicit: 0.95 },
      }),
      nsfwAggressive,
    )
    const degrading = evaluate(
      cleanClassification({
        scores: { sexual_degrading: 0.95 },
      }),
      nsfwAggressive,
    )

    expect(explicit.hide).toBe(false)
    expect(degrading.hide).toBe(true)
    expect(degrading.reason).toMatchObject({ kind: 'harm', axis: 'sexual_degrading' })
  })

  it('site ignore list does not mask severe axes', () => {
    const nsfwAggressive = rulesetFor(PRESETS.aggressive, SITE_PROFILES.nsfw)
    const verdict = evaluate(
      cleanClassification({
        scores: { sexual_violent: 0.9 },
      }),
      nsfwAggressive,
    )

    expect(verdict.hide).toBe(true)
    expect(verdict.reason).toMatchObject({ kind: 'harm', axis: 'sexual_violent' })
  })

  it('same classification vector has different verdicts under different presets', () => {
    const classification = cleanClassification({
      scores: { insult: 0.7 },
    })

    expect(evaluate(classification, PRESETS.aggressive).hide).toBe(true)
    expect(evaluate(classification, PRESETS.balanced).hide).toBe(false)
  })

  it('low confidence behavior differs by preset', () => {
    const classification = cleanClassification({ confidence: 0.4 })

    expect(evaluate(classification, PRESETS.aggressive)).toMatchObject({
      hide: true,
      reason: { kind: 'low_confidence' },
    })
    expect(evaluate(classification, PRESETS.balanced)).toMatchObject({
      hide: false,
      reason: { kind: 'low_confidence' },
    })
  })

  it('sentiment floor hides hostile messages', () => {
    const verdict = evaluate(
      cleanClassification({
        sentiment: -0.7,
        scores: { insult: 0.4 },
      }),
      PRESETS.aggressive,
    )

    expect(verdict.hide).toBe(true)
    expect(verdict.reason).toMatchObject({ kind: 'sentiment', axis: 'insult' })
  })

  it('sentiment floor does not hide tone without corroborating harm', () => {
    const verdict = evaluate(cleanClassification({ sentiment: -0.7 }), PRESETS.aggressive)

    expect(verdict.hide).toBe(false)
    expect(verdict.reason).toMatchObject({ kind: 'clean' })
  })

  it('changing sentiment corroboration ratio changes verdicts without reclassification', () => {
    const classification = cleanClassification({
      sentiment: -0.5,
      scores: { insult: 0.3 },
    })
    const permissiveRatio = {
      ...PRESETS.aggressive,
      sentimentCorroborationRatio: 0.5,
    }
    const stricterRatio = {
      ...PRESETS.aggressive,
      sentimentCorroborationRatio: 0.6,
    }

    expect(evaluate(classification, permissiveRatio).hide).toBe(true)
    expect(evaluate(classification, stricterRatio).hide).toBe(false)
  })

  it('off preset never hides even with every axis maxed out', () => {
    const scores = Object.fromEntries(
      [...HARM_AXES, ...PROTECTIVE_AXES].map((axis: ScoredAxis) => [axis, 1]),
    ) as Record<ScoredAxis, number>

    const verdict = evaluate(
      cleanClassification({
        sentiment: -1,
        confidence: 0,
        scores,
      }),
      PRESETS.off,
    )

    expect(verdict.hide).toBe(false)
    expect(verdict.reason).toMatchObject({ kind: 'clean' })
  })
})

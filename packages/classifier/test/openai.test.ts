import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '@serenity/core'
import { classifyWithOpenAI } from '../src/openai'
import { cacheKeyForText, sha256Hex } from '../src/hash'
import { CLASSIFIER_JSON_SCHEMA, CLASSIFIER_MODEL } from '../src/schema'

describe('OpenAI classifier request', () => {
  it('sends structured output schema, pinned model, and hashed safety identifier', async () => {
    const calls: unknown[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)))
      return new Response(
        JSON.stringify({
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
          },
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    insult: 0,
                    threat: 0,
                    coercion: 0,
                    identity_attack: 0,
                    appearance_attack: 0,
                    sexual_explicit: 0,
                    sexual_degrading: 0,
                    sexual_violent: 0,
                    self_harm_directed: 0,
                    parasocial_intensity: 0,
                    spam_scam: 0,
                    business_inquiry: 0,
                    transactional: 0,
                    legal_notice: 0,
                    self_harm_disclosure: 0,
                    minor_indicators: 0,
                    sentiment: 0.1,
                    targeted: 0.2,
                    confidence: 0.99,
                  }),
                },
              ],
            },
          ],
        }),
      )
    }

    const result = await classifyWithOpenAI(
      { id: 'stub-001', text: 'Synthetic stub message', tags: [] },
      { apiKey: 'test-key', installId: 'install-123', fetchImpl },
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      model: CLASSIFIER_MODEL,
      safety_identifier: sha256Hex('install-123'),
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          schema: CLASSIFIER_JSON_SCHEMA,
        },
      },
    })
    expect(result).toMatchObject({
      model: CLASSIFIER_MODEL,
      schema: SCHEMA_VERSION,
      sentiment: 0.1,
      targeted: 0.2,
      confidence: 0.99,
    })
    expect(cacheKeyForText(' A  B ')).toBe(cacheKeyForText('a b'))
  })
})

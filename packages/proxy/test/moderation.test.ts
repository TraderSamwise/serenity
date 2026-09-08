import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@serenity/classifier'
import {
  classificationFromModeration,
  hiddenByMostPermissiveHandling,
  moderateWithOpenAI,
} from '../src/moderation'
import { MODERATION_MODEL } from '../src/vector'
import { moderation } from './helpers'

describe('tier 1 moderation', () => {
  it('sends the hashed install id as safety_identifier', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(
        JSON.stringify({
          results: [
            {
              flagged: false,
              categories: {},
              category_scores: {},
            },
          ],
        }),
      )
    }

    await moderateWithOpenAI('Synthetic message', {
      apiKey: 'test-key',
      installId: 'install-123',
      fetchImpl,
    })

    expect(calls).toEqual([
      {
        url: 'https://api.openai.com/v1/moderations',
        body: {
          model: MODERATION_MODEL,
          input: 'Synthetic message',
          safety_identifier: sha256Hex('install-123'),
        },
      },
    ])
  })

  it('short-circuits only vectors hidden by the most permissive handling', () => {
    const harassment = classificationFromModeration(moderation({ harassment: true }))
    const sexual = classificationFromModeration(moderation({ sexual: true }))

    expect(harassment).not.toBeNull()
    expect(sexual).not.toBeNull()
    expect(hiddenByMostPermissiveHandling(harassment!)).toBe(true)
    expect(hiddenByMostPermissiveHandling(sexual!)).toBe(false)
  })
})

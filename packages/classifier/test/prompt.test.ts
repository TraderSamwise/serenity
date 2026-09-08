import { describe, expect, it } from 'vitest'
import { AXIS_DEFINITIONS, SCORED_AXES } from '@serenity/core'
import { buildClassifierSystemPrompt, buildClassifierUserPrompt } from '../src/prompt'

describe('classifier prompt', () => {
  it('feeds the core taxonomy into a descriptive rubric', () => {
    const prompt = buildClassifierSystemPrompt()

    for (const axis of SCORED_AXES) {
      expect(prompt).toContain(`- ${axis}: ${AXIS_DEFINITIONS[axis]}`)
    }

    expect(prompt).toContain('Describe what is present')
    expect(prompt).toContain('Score each requested taxonomy axis from 0 to 1')
  })

  it('does not ask for moderation or visibility decisions', () => {
    const prompt = buildClassifierSystemPrompt().toLowerCase()

    expect(prompt).not.toContain('should this be hidden')
    expect(prompt).not.toContain('does this violate')
    expect(prompt).not.toContain('policy')
    expect(prompt).not.toContain('moderate')
    expect(prompt).not.toContain('allowed')
  })

  it('keeps user text separate from the rubric', () => {
    expect(buildClassifierUserPrompt('hello there')).toBe('Inbound message:\nhello there')
  })
})

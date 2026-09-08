import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  SITE_PROFILES,
  classifyWithLocalHeuristics,
  hiddenByMostPermissiveHandling,
  rulesetFor,
} from '../src'
import { evaluate } from '../src/ruleset'

describe('local tier 0 heuristics', () => {
  it('catches only the obvious floor and hides under permissive handling', () => {
    const selfHarm = classifyWithLocalHeuristics('Please kys.')
    const threat = classifyWithLocalHeuristics('I will find you.')
    const scam = classifyWithLocalHeuristics('Use wallet recovery before the airdrop claim closes.')

    expect(selfHarm?.scores.self_harm_directed).toBe(1)
    expect(threat?.scores.threat).toBe(1)
    expect(scam?.scores.spam_scam).toBe(1)
    expect(hiddenByMostPermissiveHandling(selfHarm!)).toBe(true)
    expect(hiddenByMostPermissiveHandling(threat!)).toBe(true)
    expect(hiddenByMostPermissiveHandling(scam!)).toBe(true)
  })

  it('does not catch nearby benign English', () => {
    expect(classifyWithLocalHeuristics('Please do not hurt yourself.')).toBeNull()
    expect(classifyWithLocalHeuristics('I will find your invoice after the stream.')).toBeNull()
    expect(classifyWithLocalHeuristics('I need help recovering my wallet password.')).toBeNull()
  })

  it('uses the same ruleset guard as other free-tier short-circuits', () => {
    const hit = classifyWithLocalHeuristics('Go back to your country.')

    expect(hit).not.toBeNull()
    expect(evaluate(hit!, rulesetFor(PRESETS.balanced, SITE_PROFILES.standard)).hide).toBe(true)
    expect(evaluate(hit!, rulesetFor(PRESETS.balanced, SITE_PROFILES.nsfw)).hide).toBe(true)
    expect(hiddenByMostPermissiveHandling(hit!)).toBe(true)
  })
})

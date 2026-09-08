import type { HarmAxis } from './axes'
import type { Ruleset } from './ruleset'

export type PresetName = 'nuclear' | 'aggressive' | 'balanced' | 'off'
export type SiteProfileName = 'standard' | 'nsfw'

type Thresholds = Readonly<Record<HarmAxis, number>>

const NUCLEAR_THRESHOLDS: Thresholds = {
  insult: 0.3,
  threat: 0.25,
  coercion: 0.25,
  identity_attack: 0.25,
  appearance_attack: 0.3,
  sexual_explicit: 0.35,
  sexual_degrading: 0.25,
  sexual_violent: 0.2,
  self_harm_directed: 0.2,
  parasocial_intensity: 0.35,
  spam_scam: 0.35,
}

const AGGRESSIVE_THRESHOLDS: Thresholds = {
  insult: 0.65,
  threat: 0.35,
  coercion: 0.35,
  identity_attack: 0.45,
  appearance_attack: 0.55,
  sexual_explicit: 0.6,
  sexual_degrading: 0.45,
  sexual_violent: 0.35,
  self_harm_directed: 0.35,
  parasocial_intensity: 0.6,
  spam_scam: 0.55,
}

const BALANCED_THRESHOLDS: Thresholds = {
  insult: 0.75,
  threat: 0.45,
  coercion: 0.5,
  identity_attack: 0.65,
  appearance_attack: 0.75,
  sexual_explicit: 0.8,
  sexual_degrading: 0.65,
  sexual_violent: 0.45,
  self_harm_directed: 0.45,
  parasocial_intensity: 0.8,
  spam_scam: 0.75,
}

export const PRESETS = {
  nuclear: {
    name: 'nuclear',
    thresholds: NUCLEAR_THRESHOLDS,
    protectFloor: 0.65,
    sentimentFloor: -0.2,
    confidenceFloor: 0.8,
    lowConfidence: 'hide',
  },
  aggressive: {
    name: 'aggressive',
    thresholds: AGGRESSIVE_THRESHOLDS,
    protectFloor: 0.6,
    sentimentFloor: -0.55,
    confidenceFloor: 0.65,
    lowConfidence: 'hide',
  },
  balanced: {
    name: 'balanced',
    thresholds: BALANCED_THRESHOLDS,
    protectFloor: 0.55,
    sentimentFloor: -0.75,
    confidenceFloor: 0.45,
    lowConfidence: 'show',
  },
  off: {
    name: 'off',
    thresholds: {},
    protectFloor: 1.01,
    confidenceFloor: 0,
    lowConfidence: 'show',
  },
} as const satisfies Record<PresetName, Ruleset>

export const DEFAULT_PRESET = PRESETS.aggressive

export const SITE_PROFILES = {
  standard: { ignore: [] },
  nsfw: { ignore: ['sexual_explicit'] },
} as const satisfies Record<SiteProfileName, { ignore: readonly HarmAxis[] }>

export function rulesetFor(
  preset: Ruleset,
  profile: { ignore: readonly HarmAxis[] },
): Ruleset {
  return { ...preset, ignore: profile.ignore }
}

export const HARM_AXES = [
  'insult',
  'threat',
  'coercion',
  'identity_attack',
  'appearance_attack',
  'sexual_explicit',
  'sexual_degrading',
  'sexual_violent',
  'self_harm_directed',
  'parasocial_intensity',
  'spam_scam',
] as const

export const PROTECTIVE_AXES = [
  'business_inquiry',
  'transactional',
  'legal_notice',
  'self_harm_disclosure',
  'minor_indicators',
] as const

export const OVERRIDE_AXES = [
  'business_inquiry',
  'transactional',
  'legal_notice',
  'self_harm_disclosure',
] as const

export const SCORED_AXES = [...HARM_AXES, ...PROTECTIVE_AXES] as const

export type HarmAxis = (typeof HARM_AXES)[number]
export type ProtectiveAxis = (typeof PROTECTIVE_AXES)[number]
export type OverrideAxis = (typeof OVERRIDE_AXES)[number]
export type ScoredAxis = (typeof SCORED_AXES)[number]

export type AxisScore = number // 0..1 inclusive.
export type SentimentScore = number // -1..1 inclusive.
export type AxisScores = Record<ScoredAxis, AxisScore>

export interface Classification {
  model: string
  schema: number
  sentiment: SentimentScore
  targeted: AxisScore
  confidence: AxisScore
  scores: AxisScores
}

export const SCHEMA_VERSION = 1

export const AXIS_DEFINITIONS: Record<ScoredAxis, string> = {
  insult:
    'Score high when the message directly disparages, mocks, humiliates, or expresses contempt for the recipient as a person. Do not score ordinary disagreement, criticism of work, or negative feedback unless it becomes personal abuse.',
  threat:
    'Score high when the message threatens, celebrates, or implies future physical harm, stalking, doxxing with danger, or violence against the recipient or people close to them. Include veiled threats when the likely target is the recipient.',
  coercion:
    'Score high when the sender pressures the recipient through blackmail, extortion, sextortion, exposure threats, reputation threats, or demands backed by punishment. Include threats to leak private material, report falsely, or mobilize harassment unless the recipient complies.',
  identity_attack:
    'Score high when hostility targets protected or identity-linked traits such as race, ethnicity, caste, nationality, religion, disability, gender, sex, sexual orientation, or immigration status. Count slurs, dehumanizing identity claims, and attacks that use identity as the reason for contempt.',
  appearance_attack:
    "Score high when the message attacks the recipient's body, face, weight, age presentation, hygiene, attractiveness, disability presentation, or other visible traits. Do not score neutral descriptions or consensual compliments.",
  sexual_explicit:
    'Score high for explicit sexual language, sexual propositions, descriptions of sex acts, nudity, arousal, fetish content, or commercial sexual content. This axis is descriptive only: warm, consensual, platform-appropriate sexual content still scores high.',
  sexual_degrading:
    'Score high when sexual language is used to degrade, shame, objectify, dehumanize, or express contempt for the recipient. Include sexual insults, degrading demands, non-consensual objectification, and sexual comments meant to humiliate.',
  sexual_violent:
    'Score high when sexual content depicts, threatens, requests, or eroticizes non-consent, force, incapacitation, injury, coercion, or violence. Include rape threats, forced sexual acts, and sexualized harm even when phrased as fantasy.',
  self_harm_directed:
    'Score high when the sender tells the recipient to kill themselves, urges self-injury, wishes death on them, or frames the recipient harming themselves as deserved. Include abbreviations, euphemisms, and indirect encouragement when the recipient is the target.',
  parasocial_intensity:
    'Score high for obsessive attachment, entitlement to access, boundary-violating familiarity, possessiveness, surveillance claims, or demands for personal response from the recipient. Do not score normal fandom, support, or polite admiration.',
  spam_scam:
    'Score high for unsolicited promotion, phishing, impersonation, fraud, crypto or investment schemes, fake support, malware links, engagement bait, or repeated low-relevance solicitations. Include scams even when the tone is friendly.',
  business_inquiry:
    'Score high when the message appears to be a legitimate business, sponsorship, brand deal, press, booking, collaboration, licensing, agency, or professional opportunity. Rudeness does not reduce this score if the business intent is real.',
  transactional:
    'Score high when the sender is raising a payment, refund, subscription, delivery, access, account, fulfillment, moderation, or technical support issue. Include terse or frustrated customer-service messages when the practical issue is clear.',
  legal_notice:
    'Score high for legal correspondence, rights claims, takedown notices, DMCA notices, law enforcement contact, court or attorney references, regulatory complaints, or formal preservation demands. Do not require the claim to be valid.',
  self_harm_disclosure:
    "Score high when the sender discloses their own suicidal thoughts, self-harm, crisis, eating-disorder behavior, or imminent personal danger. This is about the sender's state, not abuse directed at the recipient.",
  minor_indicators:
    'Score high when the sender states or strongly indicates they are under 18, in school as a minor, age-gated out of adult contexts, or otherwise not an adult. Include contextual clues only when they are specific enough to affect handling.',
}

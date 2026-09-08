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
    'Score high when the message disparages, mocks, humiliates, or expresses contempt for the recipient as a person, including indirect contempt delivered through sarcasm, irony, backhanded compliments, faint praise, mock concern, or rhetorical questions that carry a sneer. Measure what the message does to the recipient; a polite or positive surface does not lower the score when the intent is derision. Keep low for blunt criticism of the recipient\'s work, argument, pacing, production, business decision, timing, draft quality, or public claim when it does not demean the person. Do not score ordinary bluntness as insult just because it is negative. High examples: "There is a special kind of emptiness in how certain you sound."; "Somehow the silence before you posted had more value."; "Nobody needed this, but you delivered it with full confidence."; "Your audience is patient in a way science should study."; "This has the energy of someone being wrong in public for practice." Low contrasts: "The argument felt thin even though the delivery was polished."; "The previous silence was better than rushing this update."; "I do not think this post added much to the discussion."; "Your audience was patient with a rough draft here."; "This read like an early pass at a complicated topic." In the low contrasts, the criticism targets the update, draft, argument, or topic rather than the recipient\'s intelligence, value, or character.',
  threat:
    'Score high when the message threatens, celebrates, or implies future physical harm, stalking, doxxing with danger, or violence against the recipient or people close to them. Measure what the message does to the recipient; indirect phrasing, jokes, warnings, or plausible deniability do not lower the score when the likely effect is fear for safety. High examples: "Watch your back at the meet and greet."; "It would be a shame if someone followed you home after the show." Low contrasts: "Please watch the back entrance at the meet and greet; it looked crowded."; "I hope security keeps everyone safe after the show."',
  coercion:
    'Score high when the sender pressures the recipient through blackmail, extortion, sextortion, exposure threats, reputation threats, or demands backed by punishment. Measure the pressure placed on the recipient, not just explicit threat words; implied consequences, reply-or-else framing, veiled reputational damage, and deniable escalation still count when the message tries to make the recipient comply. Severe coercion requires a concrete threatened consequence such as doxxing, leaking private material, false reporting, sextortion, or mobilized harassment. High examples: "Leaving this unresolved will make it easier for everyone to believe the thread."; "A reply now would keep this from getting uglier in places you cannot control." Severe examples: "Answer me or I post your address tonight."; "Send the photos or I report you from twenty accounts." Low contrasts: "I hope you answer the thread because people are confused."; "This may get messy if nobody explains what happened."',
  identity_attack:
    'Score high only when hostility targets protected or identity-linked traits such as race, ethnicity, caste, nationality, religion, disability, gender, sex, sexual orientation, or immigration status. Keep low when identity is mentioned neutrally or when criticism targets work, conduct, or claims rather than identity. Low example: "Your travel guide ignored immigrant paperwork details." High example: "People from your country are all scammers."',
  appearance_attack:
    'Score high only when the message attacks, demeans, shames, or uses contempt toward the recipient\'s body, face, weight, age presentation, hygiene, attractiveness, disability presentation, or other visible traits. Positive, admiring, or neutral comments about the recipient\'s body or appearance are not appearance attacks unless they demean, shame, or reduce the person to contempt. Keep low for critique of lighting, styling, camera angle, wardrobe logistics, or image quality that is about the work rather than the person. Low examples: "Your body looked amazing in the explicit mirror set."; "The lighting in the photo set flattened the colors." High examples: "Your body is disgusting in that mirror set."; "Your face ruins every photo."',
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

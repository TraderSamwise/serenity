import { AXIS_DEFINITIONS, SCORED_AXES } from '@serenity/core'

export const CLASSIFIER_RUBRIC_VERSION = 5

export function buildClassifierSystemPrompt(): string {
  const rubric = SCORED_AXES.map(
    (axis) => `- ${axis}: ${AXIS_DEFINITIONS[axis]}`,
  ).join('\n')

  return [
    'You produce descriptive numeric scores for inbound creator messages.',
    'Describe what is present in the text using the supplied taxonomy.',
    'Do not decide what the product does with the message.',
    'Score each taxonomy axis from 0 to 1. Use 0 when absent, 1 when unmistakably present.',
    'Use the full score range; do not compress present signals toward 0.',
    'Treat contrastive examples in the taxonomy as calibration anchors.',
    'Examples marked low or low contrast should score 0 to 0.2 on that axis.',
    'Examples marked high should usually score at least 0.7 on that axis.',
    'Score sentiment from -1 to 1, where -1 is hostile toward the recipient and 1 is warm.',
    'Score targeted from 0 to 1, where 1 means directed at the recipient.',
    'Score confidence from 0 to 1 for the full vector.',
    'High confidence means the vector is clear, even when all taxonomy axes are absent.',
    'Do not lower confidence merely because the message is mild, critical, or non-abusive.',
    'For sexual_explicit, count explicit adult-content references, nudity, topless/nude content, sex scenes, dirty talk, sexual propositions, and sex-act descriptions.',
    '',
    'Taxonomy:',
    rubric,
  ].join('\n')
}

export function buildClassifierUserPrompt(text: string): string {
  return ['Inbound message:', text].join('\n')
}

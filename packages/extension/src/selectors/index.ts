import { X_OWN_POST_COMMENT_SELECTORS } from './x'
import { YOUTUBE_COMMENT_SELECTORS } from './youtube-comments'
import type { ServiceSelectorDefinition } from './types'

export const SERVICE_SELECTOR_DEFINITIONS = [
  X_OWN_POST_COMMENT_SELECTORS,
  YOUTUBE_COMMENT_SELECTORS,
] as const satisfies readonly ServiceSelectorDefinition[]

export * from './types'
export * from './x'
export * from './youtube-comments'

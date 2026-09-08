import { X_OWN_POST_COMMENT_SELECTORS } from './x'
import {
  ONLYFANS_COMMENT_SELECTORS,
  ONLYFANS_DM_LIST_SELECTORS,
  ONLYFANS_DM_SELECTORS,
} from './onlyfans'
import { TWITCH_CHAT_SELECTORS } from './twitch-chat'
import { YOUTUBE_COMMENT_SELECTORS } from './youtube-comments'
import { YOUTUBE_LIVE_CHAT_SELECTORS } from './youtube-live-chat'
import type { ServiceSelectorDefinition } from './types'

export const SERVICE_SELECTOR_DEFINITIONS = [
  X_OWN_POST_COMMENT_SELECTORS,
  YOUTUBE_COMMENT_SELECTORS,
  YOUTUBE_LIVE_CHAT_SELECTORS,
  TWITCH_CHAT_SELECTORS,
  ONLYFANS_DM_LIST_SELECTORS,
  ONLYFANS_DM_SELECTORS,
  ONLYFANS_COMMENT_SELECTORS,
] as const satisfies readonly ServiceSelectorDefinition[]

export * from './types'
export * from './onlyfans'
export * from './twitch-chat'
export * from './x'
export * from './youtube-comments'
export * from './youtube-live-chat'

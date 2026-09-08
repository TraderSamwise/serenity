import type { ServiceSelectorDefinition } from './types'

export const YOUTUBE_LIVE_CHAT_SELECTORS = {
  serviceId: 'youtube_live_chat',
  urlPattern: String.raw`^https://www\.youtube\.com/watch(?:\?|$)`,
  frameSelector: 'ytd-live-chat-frame iframe#chatframe',
  containerSelector: 'yt-live-chat-renderer #items',
  rowSelector: 'yt-live-chat-text-message-renderer[id]',
} as const satisfies ServiceSelectorDefinition

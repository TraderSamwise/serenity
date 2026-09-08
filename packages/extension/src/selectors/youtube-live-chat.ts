import type { ServiceSelectorDefinition } from './types'

export const YOUTUBE_LIVE_CHAT_STABLE_ID_STRATEGY = {
  chat:
    'Use the id attribute on yt-live-chat-text-message-renderer. It is the platform live-chat message id exposed on the row inside the same-origin chat iframe.',
  iframe:
    'The watch-page content script reaches iframe#chatframe through same-origin DOM access; no extra host permission is required for the embedded live chat.',
  systemRows:
    'Select only yt-live-chat-text-message-renderer rows. Engagement cards, banners, membership notices, and paid/system renderers use different tags and are not classified here.',
} as const

export const YOUTUBE_LIVE_CHAT_SELECTORS = {
  serviceId: 'youtube_live_chat',
  surfaceType: 'stream',
  urlPattern: String.raw`^https://www\.youtube\.com/watch(?:\?|$)`,
  frameSelector: 'ytd-live-chat-frame iframe#chatframe',
  containerSelector: 'yt-live-chat-renderer #items',
  rowSelector: 'yt-live-chat-text-message-renderer[id]',
  textSelector: '#message',
  textMode: 'first',
  stableId: {
    type: 'attribute',
    attribute: 'id',
    pattern: String.raw`^(.+)$`,
    prefix: 'youtube-live-chat:',
  },
} as const satisfies ServiceSelectorDefinition

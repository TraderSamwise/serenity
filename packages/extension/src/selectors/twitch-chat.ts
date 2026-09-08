import type { ServiceSelectorDefinition } from './types'

export const TWITCH_CHAT_SELECTORS = {
  serviceId: 'twitch_chat',
  urlPattern: String.raw`^https://www\.twitch\.tv/(?!directory(?:/|$)|videos(?:/|$)|settings(?:/|$)|subscriptions(?:/|$)|wallet(?:/|$))[A-Za-z0-9_]{3,25}(?:\?|$|/)`,
  containerSelector: '[data-a-target="chat-scroller"]',
  rowSelector: '[data-a-target="chat-line-message"]',
} as const satisfies ServiceSelectorDefinition

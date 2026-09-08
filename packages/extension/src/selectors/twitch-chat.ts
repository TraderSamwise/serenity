import type { ServiceSelectorDefinition } from './types'

const TWITCH_MESSAGE_ID_PATTERN = String.raw`^([0-9a-fA-F-]{36})$`

export const TWITCH_CHAT_STABLE_ID_STRATEGY = {
  chat:
    'Use the Twitch chat message id from the chat-line React message.id prop. It is a platform UUID and survives row pruning and virtualized DOM reuse.',
  systemRows:
    'Select only data-a-target="chat-line-message" rows. Welcome lines, notices, subscriptions, raids, and other system rows use separate targets and are not creator-inbound messages.',
} as const

export const TWITCH_CHAT_SELECTORS = {
  serviceId: 'twitch_chat',
  urlPattern: String.raw`^https://www\.twitch\.tv/(?!directory(?:/|$)|videos(?:/|$)|settings(?:/|$)|subscriptions(?:/|$)|wallet(?:/|$))[A-Za-z0-9_]{3,25}(?:\?|$|/)`,
  containerSelector: '[data-a-target="chat-scroller"]',
  rowSelector: '[data-a-target="chat-line-message"]',
  textSelector: '[data-a-target="chat-message-text"], [data-a-target="emote-name"]',
  textMode: 'all',
  stableId: {
    type: 'react-prop',
    propPath: ['message', 'id'],
    pattern: TWITCH_MESSAGE_ID_PATTERN,
    prefix: 'twitch-message:',
  },
} as const satisfies ServiceSelectorDefinition

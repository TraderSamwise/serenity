import type { ServiceSelectorDefinition } from './types'

export const ONLYFANS_STABLE_ID_STRATEGY = {
  dms:
    'Use the OnlyFans message id from the chat-row Vue message.id prop. It is platform message identity and survives virtual scrolling.',
  comments:
    'Use the OnlyFans comment id from the comment-row Vue comment.id prop. Comments are a different DOM and route from DMs, so they are a separate NSFW service.',
  risk:
    'OnlyFans exposes ids through Vue internals rather than public attributes. If the prop path disappears, extraction must fail closed and not derive an id from DOM position.',
} as const

export const ONLYFANS_DM_SELECTORS = {
  serviceId: 'onlyfans_dms',
  urlPattern: String.raw`^https://onlyfans\.com/my/chats/chat/[0-9]+/?(?:[?#].*)?$`,
  containerSelector: '.b-chat__messages',
  rowSelector: '.b-chat__messages .b-chat__message',
  textSelector: '.b-chat__message__text-holder',
  textMode: 'first',
  stableId: {
    type: 'vue-prop',
    propPath: ['message', 'id'],
    pattern: String.raw`^([0-9]+)$`,
    prefix: 'onlyfans-message:',
  },
} as const satisfies ServiceSelectorDefinition

export const ONLYFANS_COMMENT_SELECTORS = {
  serviceId: 'onlyfans_comments',
  urlPattern: String.raw`^https://onlyfans\.com/[0-9]+/[^/?#]+/?(?:[?#].*)?$`,
  containerSelector: '.b-comments__list',
  rowSelector: '.b-comments__item.m-break-word.g-position-relative',
  textSelector: '.b-comments__item-text',
  textMode: 'first',
  stableId: {
    type: 'vue-prop',
    propPath: ['comment', 'id'],
    pattern: String.raw`^([0-9]+)$`,
    prefix: 'onlyfans-comment:',
  },
} as const satisfies ServiceSelectorDefinition

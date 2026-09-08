import type { ServiceSelectorDefinition } from './types'

export const ONLYFANS_DM_LIST_SELECTORS = {
  serviceId: 'onlyfans_dms',
  urlPattern: String.raw`^https://onlyfans\.com/my/chats/(?:chat/[0-9]+/?)?(?:[?#].*)?$`,
  containerSelector: '.b-chats__list-dialogues',
  rowSelector: '.b-chats__item',
  textSelector: '.b-chats__item__last-message__content',
} as const satisfies ServiceSelectorDefinition

export const ONLYFANS_DM_SELECTORS = {
  serviceId: 'onlyfans_dms',
  urlPattern: String.raw`^https://onlyfans\.com/my/chats/(?:chat/[0-9]+/?)?(?:[?#].*)?$`,
  containerSelector: '.b-chat__messages',
  rowSelector: '.b-chat__messages .b-chat__message',
  textSelector: '.b-chat__message__text',
} as const satisfies ServiceSelectorDefinition

export const ONLYFANS_COMMENT_SELECTORS = {
  serviceId: 'onlyfans_comments',
  urlPattern: String.raw`^https://onlyfans\.com/[0-9]+/[^/?#]+/?(?:[?#].*)?$`,
  containerSelector: '.b-comments__list',
  rowSelector: '.b-comments__item.m-break-word.g-position-relative',
  textSelector: '.b-comments__item-text',
} as const satisfies ServiceSelectorDefinition

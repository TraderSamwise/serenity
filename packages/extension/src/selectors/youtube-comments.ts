import type { ServiceSelectorDefinition } from './types'

export const YOUTUBE_COMMENT_SELECTORS = {
  serviceId: 'youtube_comments',
  urlPattern: String.raw`^https://www\.youtube\.com/watch(?:\?|$)`,
  containerSelector: 'ytd-comments#comments',
  rowSelector: 'ytd-comment-thread-renderer #comment-container > ytd-comment-view-model#comment',
  textSelector: '.ytAttributedStringHost',
  nestedRowSelectors: [
    'ytd-comment-replies-renderer #expanded-threads ytd-comment-view-model#comment',
    'ytd-comment-replies-renderer #contents ytd-comment-view-model#comment',
  ],
} as const satisfies ServiceSelectorDefinition

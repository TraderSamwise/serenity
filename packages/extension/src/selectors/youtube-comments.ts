import type { ServiceSelectorDefinition } from './types'

const YOUTUBE_COMMENT_ID_PATTERN = String.raw`[?&]lc=([^&#]+)`

export const YOUTUBE_COMMENT_STABLE_ID_STRATEGY = {
  comments:
    'Use the lc query parameter from the comment permalink. It is YouTube platform comment identity and survives lazy loading, nesting, and row recycling.',
  replies:
    'Replies are separate comment rows with their own lc permalink when expanded. The content script owns hash-to-row mapping; YouTube live chat is a separate service.',
} as const

export const YOUTUBE_COMMENT_SELECTORS = {
  serviceId: 'youtube_comments',
  urlPattern: String.raw`^https://www\.youtube\.com/watch(?:\?|$)`,
  containerSelector: 'ytd-comments#comments',
  rowSelector: 'ytd-comment-thread-renderer #comment-container > ytd-comment-view-model#comment',
  nestedRowSelectors: [
    'ytd-comment-replies-renderer #expanded-threads ytd-comment-view-model#comment',
    'ytd-comment-replies-renderer #contents ytd-comment-view-model#comment',
  ],
  textSelector: '#content-text',
  textMode: 'first',
  stableId: {
    type: 'attribute',
    selector: 'a[href*="lc="]',
    attribute: 'href',
    pattern: YOUTUBE_COMMENT_ID_PATTERN,
    prefix: 'youtube-comment:',
  },
} as const satisfies ServiceSelectorDefinition

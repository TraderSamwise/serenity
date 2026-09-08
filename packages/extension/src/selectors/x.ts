import type { ServiceSelectorDefinition } from './types'

const X_STATUS_ID_PATTERN = String.raw`/status/([0-9]+)`

export const X_STABLE_ID_STRATEGY = {
  ownPostComments:
    'Use the tweet id from a row status link. It is X platform content identity and survives virtual scrolling.',
  dms:
    'DM selectors stay absent until a live message row is inspectable. Use a platform message id, or conversation id plus platform message timestamp/id. If none exists, keep the row hidden and do not derive identity from DOM path or node reference.',
} as const

export const X_OWN_POST_COMMENT_SELECTORS = {
  serviceId: 'x_own_post_comments',
  urlPattern: String.raw`^https://x\.com/[^/]+/status/[0-9]+`,
  containerSelector: '[data-testid="primaryColumn"]',
  rowSelector: 'article[data-testid="tweet"]',
  textSelector: '[data-testid="tweetText"]',
  textMode: 'first',
  stableId: {
    type: 'attribute',
    selector: 'a[href*="/status/"]',
    attribute: 'href',
    pattern: X_STATUS_ID_PATTERN,
    prefix: 'x-status:',
  },
  excludeStableIdFromLocation: {
    pattern: X_STATUS_ID_PATTERN,
    prefix: 'x-status:',
  },
} as const satisfies ServiceSelectorDefinition

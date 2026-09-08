import type { ServiceSelectorDefinition } from './types'

export const X_OWN_POST_COMMENT_SELECTORS = {
  serviceId: 'x_own_post_comments',
  urlPattern: String.raw`^https://x\.com/[^/]+/status/[0-9]+`,
  containerSelector: '[data-testid="primaryColumn"]',
  rowSelector: 'article[data-testid="tweet"]',
  skipFirstRow: true,
} as const satisfies ServiceSelectorDefinition

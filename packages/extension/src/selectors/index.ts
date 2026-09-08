import { X_OWN_POST_COMMENT_SELECTORS } from './x'
import type { ServiceSelectorDefinition } from './types'

export const SERVICE_SELECTOR_DEFINITIONS = [
  X_OWN_POST_COMMENT_SELECTORS,
] as const satisfies readonly ServiceSelectorDefinition[]

export * from './types'
export * from './x'

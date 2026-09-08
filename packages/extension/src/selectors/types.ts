import type { ServiceId } from '@serenity/core'

export interface ServiceSelectorDefinition {
  serviceId: ServiceId
  urlPattern: string
  containerSelector: string
  rowSelector: string
  nestedRowSelectors?: readonly string[]
  textSelector: string
  textMode: 'first' | 'all'
  stableId: AttributeStableIdRule
  excludeStableIdFromLocation?: LocationStableIdRule
}

export interface AttributeStableIdRule {
  type: 'attribute'
  selector: string
  attribute: string
  pattern: string
  prefix: string
}

export interface LocationStableIdRule {
  pattern: string
  prefix: string
}

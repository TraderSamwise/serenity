import type { ServiceId } from '@serenity/core'

export interface ServiceSelectorDefinition {
  serviceId: ServiceId
  surfaceType: SurfaceType
  urlPattern: string
  frameSelector?: string
  containerSelector: string
  rowSelector: string
  nestedRowSelectors?: readonly string[]
  textSelector: string
  textMode: 'first' | 'all'
  stableId: AttributeStableIdRule | ReactPropStableIdRule | VuePropStableIdRule
  excludeStableIdFromLocation?: LocationStableIdRule
}

export type SurfaceType = 'item_feed' | 'stream' | 'gated_thread' | 'summary_list'

export interface AttributeStableIdRule {
  type: 'attribute'
  selector?: string
  attribute: string
  pattern: string
  prefix: string
}

export interface ReactPropStableIdRule {
  type: 'react-prop'
  propPath: readonly string[]
  pattern: string
  prefix: string
}

export interface VuePropStableIdRule {
  type: 'vue-prop'
  propPath: readonly string[]
  pattern: string
  prefix: string
}

export interface LocationStableIdRule {
  pattern: string
  prefix: string
}

import type { ServiceId } from '@serenity/core'

export interface ServiceSelectorDefinition {
  serviceId: ServiceId
  urlPattern: string
  frameSelector?: string
  containerSelector: string
  rowSelector: string
  nestedRowSelectors?: readonly string[]
  skipFirstRow?: boolean
}

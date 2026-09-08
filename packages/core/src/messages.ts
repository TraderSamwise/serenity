import type { ServiceId } from './services'
import type { PresetName } from './presets'

export const HIDE_OPTIMISTICALLY = true

export interface ExtractedMessage {
  stableId: string
  text: string
}

export interface MessageVerdict {
  stableId: string
  hide: boolean
}

export interface ClassifyMessagesRequest {
  type: 'serenity.classifyMessages'
  serviceId: ServiceId
  messages: readonly ExtractedMessage[]
}

export interface ClassifyMessagesResponse {
  type: 'serenity.classifyMessagesResult'
  optimisticHide: true
  verdicts: readonly MessageVerdict[]
}

export interface PopupStateRequest {
  type: 'serenity.popupState'
}

export interface SetDefaultPresetRequest {
  type: 'serenity.setDefaultPreset'
  preset: PresetName
}

export interface SetServicePresetOverrideRequest {
  type: 'serenity.setServicePresetOverride'
  serviceId: ServiceId
  preset: PresetName | null
}

export interface PopupStateResponse {
  type: 'serenity.popupStateResult'
  currentPreset: PresetName
  servicePresetOverrides: Partial<Record<ServiceId, PresetName>>
  hiddenCount: number
}

export type ExtensionRequest =
  | ClassifyMessagesRequest
  | PopupStateRequest
  | SetDefaultPresetRequest
  | SetServicePresetOverrideRequest
export type ExtensionResponse = ClassifyMessagesResponse | PopupStateResponse

import type { ServiceId } from './services'
import type { PresetName } from './presets'
import type { Classification } from './axes'

export const HIDE_OPTIMISTICALLY = true

export interface ExtractedMessage {
  hash: string
  stableId: string
  text: string
}

export type MessageVerdict =
  | ClassifiedMessageVerdict
  | HiddenMessageVerdict
  | UnclassifiedMessageVerdict

export interface ClassifiedMessageVerdict {
  stableId: string
  hide: boolean
  status: 'classified'
}

export interface HiddenMessageVerdict {
  stableId: string
  hide: true
  status: 'hidden'
  reason: 'tier0_local_heuristic' | 'tier1_moderation'
}

export interface UnclassifiedMessageVerdict {
  stableId: string
  hide: true
  status: 'unclassified'
  reason: 'quota_exhausted' | 'no_proxy_token'
}

export interface HashVerdict {
  hash: string
  hide: boolean
}

export interface ClassifyMessagesRequest {
  type: 'serenity.classifyMessages'
  serviceId: ServiceId
  /** Content scripts own stableId-to-hash maps; MV3 workers only see this batch. */
  messages: readonly ExtractedMessage[]
}

export interface ClassifyMessagesResponse {
  type: 'serenity.classifyMessagesResult'
  optimisticHide: true
  verdicts: readonly MessageVerdict[]
}

export type ProxyClassifyResult =
  | {
      status: 'classified'
      classification: Classification
    }
  | {
      status: 'hidden'
      reason: 'tier0_local_heuristic' | 'tier1_moderation'
    }
  | {
      status: 'unclassified'
      reason: 'quota_exhausted'
    }

export interface ProxyClassifyResponse {
  results: readonly ProxyClassifyResult[]
}

export interface PopupStateRequest {
  type: 'serenity.popupState'
}

export interface RefilterCachedMessagesRequest {
  type: 'serenity.refilterCachedMessages'
}

export interface RefilterCachedMessagesResponse {
  type: 'serenity.refilterCachedMessagesResult'
  /** Hash-keyed because content scripts map hashes back to current DOM stableIds. */
  verdicts: readonly HashVerdict[]
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
  | RefilterCachedMessagesRequest
  | SetDefaultPresetRequest
  | SetServicePresetOverrideRequest
export type ExtensionResponse =
  | ClassifyMessagesResponse
  | PopupStateResponse
  | RefilterCachedMessagesResponse

import {
  HIDE_OPTIMISTICALLY,
  SERVICES,
  SITE_PROFILES,
  evaluate,
  rulesetFor,
} from '@serenity/core'
import type {
  ClassifyMessagesRequest,
  ClassifyMessagesResponse,
  ExtensionRequest,
  ExtensionResponse,
  MessageVerdict,
  PopupStateResponse,
  ServiceId,
} from '@serenity/core'
import { hashMessageText } from './hash'
import { IndexedDbLocalVectorCache } from './local-cache'
import type { LocalCacheRecord, LocalVectorCache } from './local-cache'
import { HttpProxyClient } from './proxy-client'
import type { ProxyClient } from './proxy-client'
import {
  ChromeSettingsStore,
  presetForService,
} from './settings'
import type { ExtensionSettings, SettingsStore } from './settings'

export interface BackgroundDependencies {
  cache: LocalVectorCache
  settingsStore: SettingsStore
  proxy: ProxyClient
}

export async function handleRuntimeMessage(
  message: ExtensionRequest,
  deps: BackgroundDependencies,
): Promise<ExtensionResponse> {
  if (message.type === 'serenity.popupState') return popupState(deps.settingsStore)
  if (message.type === 'serenity.setDefaultPreset') {
    const settings = await deps.settingsStore.get()
    await updateHiddenCount(deps.cache, deps.settingsStore, {
      ...settings,
      defaultPreset: message.preset,
    })
    return popupState(deps.settingsStore)
  }
  if (message.type === 'serenity.setServicePresetOverride') {
    const settings = await deps.settingsStore.get()
    const servicePresetOverrides = { ...settings.servicePresetOverrides }
    if (message.preset === null) {
      delete servicePresetOverrides[message.serviceId]
    } else {
      servicePresetOverrides[message.serviceId] = message.preset
    }
    await updateHiddenCount(deps.cache, deps.settingsStore, {
      ...settings,
      servicePresetOverrides,
    })
    return popupState(deps.settingsStore)
  }
  return handleClassifyMessages(message, deps)
}

export async function handleClassifyMessages(
  request: ClassifyMessagesRequest,
  deps: BackgroundDependencies,
): Promise<ClassifyMessagesResponse> {
  const settings = await deps.settingsStore.get()
  const prepared = await Promise.all(
    request.messages.map(async (message) => {
      const hash = await hashMessageText(message.text)
      return {
        message,
        hash,
        cached: await deps.cache.get(hash),
      }
    }),
  )
  const missingByHash = new Map(
    prepared
      .filter((item) => item.cached === undefined)
      .map((item) => [item.hash, item.message.text]),
  )

  if (missingByHash.size > 0 && settings.proxyToken !== undefined) {
    const texts = [...missingByHash.values()]
    const hashes = [...missingByHash.keys()]
    const response = await deps.proxy.classify(texts, settings.proxyToken, settings.proxyUrl)
    if (response.classifications.length !== texts.length) {
      throw new Error('Proxy returned the wrong number of classifications.')
    }
    await Promise.all(
      texts.map((text, index) =>
        deps.cache.put({
          hash: hashes[index]!,
          text,
          serviceId: request.serviceId,
          classification: response.classifications[index]!,
        }),
      ),
    )
  }

  const verdicts = await Promise.all(
    prepared.map(async ({ message, hash }) =>
      verdictForMessage(message.stableId, hash, request.serviceId, settings, deps.cache),
    ),
  )
  await updateHiddenCount(deps.cache, deps.settingsStore, settings)

  return {
    type: 'serenity.classifyMessagesResult',
    optimisticHide: HIDE_OPTIMISTICALLY,
    verdicts,
  }
}

export async function refilterCachedMessages(
  cache: LocalVectorCache,
  settings: ExtensionSettings,
): Promise<MessageVerdict[]> {
  const records = await cache.all()
  return records.map((record) => ({
    stableId: record.hash,
    hide: record.serviceIds.some((serviceId) => evaluateRecord(record, serviceId, settings)),
  }))
}

export async function popupState(
  settingsStore: SettingsStore,
): Promise<PopupStateResponse> {
  const settings = await settingsStore.get()
  return {
    type: 'serenity.popupStateResult',
    currentPreset: settings.defaultPreset,
    servicePresetOverrides: settings.servicePresetOverrides,
    hiddenCount: settings.hiddenCount,
  }
}

export function registerBackgroundListeners(
  runtime = chrome.runtime,
  createDeps = createChromeBackgroundDependencies,
): void {
  runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
    void handleRuntimeMessage(message, createDeps()).then(sendResponse)
    return true
  })
}

export function createChromeBackgroundDependencies(): BackgroundDependencies {
  const settingsStore = new ChromeSettingsStore()
  return {
    cache: new IndexedDbLocalVectorCache(),
    settingsStore,
    proxy: new HttpProxyClient(),
  }
}

async function verdictForMessage(
  stableId: string,
  hash: string,
  serviceId: ServiceId,
  settings: ExtensionSettings,
  cache: LocalVectorCache,
): Promise<MessageVerdict> {
  const cached = await cache.get(hash)
  if (cached === undefined) return { stableId, hide: true }
  return { stableId, hide: evaluateRecord(cached, serviceId, settings) }
}

function evaluateRecord(
  record: LocalCacheRecord,
  serviceId: ServiceId,
  settings: ExtensionSettings,
): boolean {
  const preset = presetForService(settings, serviceId)
  const service = SERVICES[serviceId]
  return evaluate(record.classification, rulesetFor(preset, SITE_PROFILES[service.profile])).hide
}

async function updateHiddenCount(
  cache: LocalVectorCache,
  settingsStore: SettingsStore,
  settings: ExtensionSettings,
): Promise<void> {
  const verdicts = await refilterCachedMessages(cache, settings)
  await settingsStore.set({
    ...settings,
    hiddenCount: verdicts.filter((verdict) => verdict.hide).length,
  })
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage !== undefined) {
  registerBackgroundListeners()
}

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
  HashVerdict,
  MessageVerdict,
  PopupStateResponse,
  RefilterCachedMessagesResponse,
  ServiceId,
} from '@serenity/core'
import { IndexedDbLocalVectorCache } from './local-cache'
import type { LocalCacheRecord, LocalVectorCache } from './local-cache'
import { HttpProxyClient } from './proxy-client'
import type { ProxyClient } from './proxy-client'
import {
  ChromeSettingsStore,
  presetForService,
  totalHiddenCount,
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
  if (message.type === 'serenity.refilterCachedMessages') {
    return refilterCachedMessagesResponse(deps.cache, await deps.settingsStore.get())
  }
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
    request.messages.map(async (message) => ({
      message,
      hash: message.hash,
      cached: await deps.cache.get(message.hash),
    })),
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
    if (response.results.length !== texts.length) {
      throw new Error('Proxy returned the wrong number of results.')
    }
    await Promise.all(
      texts.map((text, index) => {
        const result = response.results[index]!
        if (result.status === 'unclassified') return Promise.resolve()
        return deps.cache.put({
          hash: hashes[index]!,
          text,
          serviceId: request.serviceId,
          classification: result.classification,
        })
      }),
    )
  }
  await Promise.all(
    prepared
      .filter((item) => item.cached !== undefined)
      .map((item) =>
        deps.cache.put({
          hash: item.hash,
          text: item.message.text,
          serviceId: request.serviceId,
          classification: item.cached!.classification,
        }),
      ),
  )

  const verdicts = await Promise.all(
    prepared.map(async ({ message, hash }) =>
      verdictForMessage(message.stableId, hash, request.serviceId, settings, deps.cache),
    ),
  )
  const awaitingVerdict = (
    await Promise.all(
      verdicts.map(async (verdict) => {
        const preparedItem = prepared.find((item) => item.message.stableId === verdict.stableId)
        return (
          verdict.status === 'unclassified' ||
          (verdict.hide && preparedItem !== undefined && (await deps.cache.get(preparedItem.hash)) === undefined)
        )
      }),
    )
  ).filter(Boolean).length
  await updateHiddenCount(deps.cache, deps.settingsStore, settings, awaitingVerdict)

  return {
    type: 'serenity.classifyMessagesResult',
    optimisticHide: HIDE_OPTIMISTICALLY,
    verdicts,
  }
}

export async function refilterCachedMessages(
  cache: LocalVectorCache,
  settings: ExtensionSettings,
): Promise<HashVerdict[]> {
  const records = await cache.all()
  return records.map((record) => ({
    hash: record.hash,
    hide: record.serviceIds.some((serviceId) => evaluateRecord(record, serviceId, settings)),
  }))
}

export async function refilterCachedMessagesResponse(
  cache: LocalVectorCache,
  settings: ExtensionSettings,
): Promise<RefilterCachedMessagesResponse> {
  return {
    type: 'serenity.refilterCachedMessagesResult',
    verdicts: await refilterCachedMessages(cache, settings),
  }
}

export async function popupState(
  settingsStore: SettingsStore,
): Promise<PopupStateResponse> {
  const settings = await settingsStore.get()
  return {
    type: 'serenity.popupStateResult',
    currentPreset: settings.defaultPreset,
    servicePresetOverrides: settings.servicePresetOverrides,
    hiddenCount: totalHiddenCount(settings),
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
  if (cached === undefined) return { stableId, hide: true, status: 'unclassified' }
  return { stableId, hide: evaluateRecord(cached, serviceId, settings), status: 'classified' }
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
  awaitingVerdict = settings.hiddenCounts.awaitingVerdict,
): Promise<void> {
  const verdicts = await refilterCachedMessages(cache, settings)
  await settingsStore.set({
    ...settings,
    hiddenCounts: {
      byVerdict: verdicts.filter((verdict) => verdict.hide).length,
      awaitingVerdict,
    },
  })
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage !== undefined) {
  registerBackgroundListeners()
}

import {
  SERVICES,
  SITE_PROFILES,
  classifyWithLocalHeuristics,
  evaluate,
  hiddenByMostPermissiveHandling,
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
  ProxyClassifyResult,
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

type NonClassifiedProxyResult = Extract<ProxyClassifyResult, { status: 'hidden' | 'unclassified' }>

export interface BackgroundDependencies {
  cache: LocalVectorCache
  settingsStore: SettingsStore
  proxy: ProxyClient
  createInstallId?: () => string
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
  let settings = await deps.settingsStore.get()
  const prepared = await Promise.all(
    request.messages.map(async (message) => ({
      message,
      hash: message.hash,
      cached: await deps.cache.get(message.hash),
    })),
  )
  const localHiddenHashes = new Set(
    prepared
      .filter((item) => item.cached === undefined)
      .filter((item) => {
        const local = classifyWithLocalHeuristics(item.message.text)
        return (
          local !== null &&
          hiddenByMostPermissiveHandling(local) &&
          evaluateClassification(local, item.hash, request.serviceId, settings).hide
        )
      })
      .map((item) => item.hash),
  )
  const missingByHash = new Map(
    prepared
      .filter((item) => item.cached === undefined && !localHiddenHashes.has(item.hash))
      .map((item) => [item.hash, item.message.text]),
  )
  const proxyResultsByHash = new Map<string, NonClassifiedProxyResult>()

  if (missingByHash.size > 0 && settings.proxyToken === undefined) {
    settings = await ensureProxyToken(settings, deps)
  }

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
        const hash = hashes[index]!
        if (result.status === 'unclassified' || result.status === 'hidden') {
          proxyResultsByHash.set(hash, result)
          return Promise.resolve()
        }
        return deps.cache.put({
          hash,
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
      verdictForMessage(
        hash,
        request.serviceId,
        settings,
        deps.cache,
        localHiddenHashes,
        proxyResultsByHash,
      ),
    ),
  )
  const awaitingVerdict = (
    verdicts.map((verdict) => verdict.status === 'unclassified')
  ).filter(Boolean).length
  const hiddenWithoutVector = verdicts.filter((verdict) => verdict.status === 'hidden').length
  await updateHiddenCount(
    deps.cache,
    deps.settingsStore,
    settings,
    awaitingVerdict,
    hiddenWithoutVector,
  )

  return {
    type: 'serenity.classifyMessagesResult',
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
    createInstallId: () => crypto.randomUUID(),
  }
}

async function ensureProxyToken(
  settings: ExtensionSettings,
  deps: BackgroundDependencies,
): Promise<ExtensionSettings> {
  const installId = settings.installId ?? (
    deps.createInstallId === undefined ? crypto.randomUUID() : deps.createInstallId()
  )
  const settingsWithInstallId =
    settings.installId === installId ? settings : { ...settings, installId }
  if (settings.installId === undefined) await deps.settingsStore.set(settingsWithInstallId)

  try {
    const registered = await deps.proxy.registerInstall(installId, settings.proxyUrl)
    const nextSettings = { ...settingsWithInstallId, proxyToken: registered.token }
    await deps.settingsStore.set(nextSettings)
    return nextSettings
  } catch {
    return settingsWithInstallId
  }
}

async function verdictForMessage(
  hash: string,
  serviceId: ServiceId,
  settings: ExtensionSettings,
  cache: LocalVectorCache,
  localHiddenHashes: ReadonlySet<string> = new Set(),
  proxyResultsByHash: ReadonlyMap<
    string,
    NonClassifiedProxyResult
  > = new Map(),
): Promise<MessageVerdict> {
  const cached = await cache.get(hash)
  if (cached !== undefined) {
    return evaluateClassification(cached.classification, hash, serviceId, settings)
  }
  if (localHiddenHashes.has(hash)) {
    return {
      hash,
      hide: true,
      status: 'hidden',
      reason: 'tier0_local_heuristic',
    }
  }
  const proxyResult = proxyResultsByHash.get(hash)
  if (proxyResult?.status === 'hidden') {
    return { hash, hide: true, status: 'hidden', reason: proxyResult.reason }
  }
  return {
    hash,
    hide: true,
    status: 'unclassified',
    reason: settings.proxyToken === undefined ? 'no_proxy_token' : 'quota_exhausted',
  }
}

function evaluateClassification(
  classification: LocalCacheRecord['classification'],
  hash: string,
  serviceId: ServiceId,
  settings: ExtensionSettings,
): MessageVerdict {
  return {
    hash,
    hide: evaluateForService(classification, serviceId, settings),
    status: 'classified',
  }
}

function evaluateRecord(
  record: LocalCacheRecord,
  serviceId: ServiceId,
  settings: ExtensionSettings,
): boolean {
  return evaluateForService(record.classification, serviceId, settings)
}

function evaluateForService(
  classification: LocalCacheRecord['classification'],
  serviceId: ServiceId,
  settings: ExtensionSettings,
): boolean {
  const preset = presetForService(settings, serviceId)
  const service = SERVICES[serviceId]
  return evaluate(classification, rulesetFor(preset, SITE_PROFILES[service.profile])).hide
}

async function updateHiddenCount(
  cache: LocalVectorCache,
  settingsStore: SettingsStore,
  settings: ExtensionSettings,
  awaitingVerdict = settings.hiddenCounts.awaitingVerdict,
  hiddenWithoutVector = 0,
): Promise<void> {
  const verdicts = await refilterCachedMessages(cache, settings)
  await settingsStore.set({
    ...settings,
    hiddenCounts: {
      byVerdict: verdicts.filter((verdict) => verdict.hide).length + hiddenWithoutVector,
      awaitingVerdict,
    },
  })
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage !== undefined) {
  registerBackgroundListeners()
}

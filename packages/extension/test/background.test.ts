import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTENSION_SETTINGS } from '../src/settings'
import type { Classification, ProxyClassifyResult, ServiceId } from '@serenity/core'
import {
  handleRuntimeMessage,
  handleClassifyMessages,
  popupState,
  refilterCachedMessages,
} from '../src/background'
import { hashMessageText } from '../src/hash'
import { MemoryLocalVectorCache } from '../src/local-cache'
import { MemorySettingsStore } from '../src/settings'
import type { ProxyClient } from '../src/proxy-client'
import { classification } from './helpers'

describe('background worker logic', () => {
  it('batches and dedupes uncached texts before calling the proxy', async () => {
    const cache = new MemoryLocalVectorCache()
    const proxy = recordingProxy([classification({ insult: 0.8 })])
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
      proxyToken: 'signed-token',
    })
    const hash = await hashMessageText('same bad text')

    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [
          { hash, text: 'same bad text' },
          { hash, text: 'same bad text' },
        ],
      },
      { cache, settingsStore, proxy },
    )

    expect(proxy.calls).toEqual([
      {
        messages: ['same bad text'],
        token: 'signed-token',
        proxyUrl: 'https://proxy.example',
      },
    ])
    expect(response.verdicts).toEqual([
      { hash, hide: true, status: 'classified' },
      { hash, hide: true, status: 'classified' },
    ])
    expect(JSON.stringify(response)).not.toContain('same bad text')
    expect(JSON.stringify(response)).not.toContain('insult')
  })

  it.each(['twitch_chat', 'youtube_live_chat'] satisfies ServiceId[])(
    'collapses repeated %s messages to one proxy classification and reuses the cache',
    async (serviceId) => {
    const cache = new MemoryLocalVectorCache()
    const proxy = recordingProxy([classification({})])
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
      proxyToken: 'signed-token',
    })
    const text = 'same chat wave'
    const hash = await hashMessageText(text)

    const first = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId,
        messages: Array.from({ length: 40 }, () => ({
          hash,
          text,
        })),
      },
      { cache, settingsStore, proxy },
    )
    const second = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId,
        messages: Array.from({ length: 10 }, () => ({
          hash,
          text,
        })),
      },
      { cache, settingsStore, proxy },
    )

    expect(proxy.calls).toEqual([
      {
        messages: [text],
        token: 'signed-token',
        proxyUrl: 'https://proxy.example',
      },
    ])
    expect(first.verdicts).toHaveLength(40)
    expect(second.verdicts).toHaveLength(10)
    expect(first.verdicts.every((verdict) => verdict.hide === false && verdict.status === 'classified')).toBe(true)
    expect(second.verdicts.every((verdict) => verdict.hide === false && verdict.status === 'classified')).toBe(true)
    },
  )

  it('registers on first classification, stores the token, and then classifies', async () => {
    const cache = new MemoryLocalVectorCache()
    const proxy = recordingProxy([classification({ insult: 0.2 })], {
      token: 'registered-token',
    })
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
    })
    const hash = await hashMessageText('first run text')

    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [{ hash, text: 'first run text' }],
      },
      {
        cache,
        settingsStore,
        proxy,
        createInstallId: () => '123e4567-e89b-12d3-a456-426614174000',
      },
    )

    expect(proxy.registerCalls).toEqual([
      {
        installId: '123e4567-e89b-12d3-a456-426614174000',
        proxyUrl: 'https://proxy.example',
      },
    ])
    expect(proxy.calls).toEqual([
      {
        messages: ['first run text'],
        token: 'registered-token',
        proxyUrl: 'https://proxy.example',
      },
    ])
    expect(response.verdicts).toEqual([{ hash, hide: false, status: 'classified' }])
    expect(await settingsStore.get()).toMatchObject({
      installId: '123e4567-e89b-12d3-a456-426614174000',
      proxyToken: 'registered-token',
    })
  })

  it('keeps uncached messages hidden and retries later when registration fails', async () => {
    const settingsStore = new MemorySettingsStore()
    const proxy = recordingProxy([], { registerError: new Error('offline') })
    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [
          {
            hash: await hashMessageText('unclassified text'),
            text: 'unclassified text',
          },
        ],
      },
      {
        cache: new MemoryLocalVectorCache(),
        settingsStore,
        proxy,
        createInstallId: () => '123e4567-e89b-12d3-a456-426614174000',
      },
    )

    expect(response).toMatchObject({
      verdicts: [{ hide: true, status: 'unclassified', reason: 'no_proxy_token' }],
    })
    expect(proxy.registerCalls).toHaveLength(1)
    const failedSettings = await settingsStore.get()
    expect(failedSettings.installId).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(failedSettings).not.toHaveProperty('proxyToken')

    await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [
          {
            hash: await hashMessageText('still unclassified text'),
            text: 'still unclassified text',
          },
        ],
      },
      {
        cache: new MemoryLocalVectorCache(),
        settingsStore,
        proxy,
        createInstallId: () => 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      },
    )

    expect(proxy.registerCalls).toEqual([
      {
        installId: '123e4567-e89b-12d3-a456-426614174000',
        proxyUrl: DEFAULT_EXTENSION_SETTINGS.proxyUrl,
      },
      {
        installId: '123e4567-e89b-12d3-a456-426614174000',
        proxyUrl: DEFAULT_EXTENSION_SETTINGS.proxyUrl,
      },
    ])
  })

  it('short-circuits tier 0 locally without proxy calls or vector cache writes', async () => {
    const cache = new MemoryLocalVectorCache()
    const proxy = recordingProxy([])
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
      proxyToken: 'signed-token',
    })
    const hash = await hashMessageText('kys')

    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'youtube_comments',
        messages: [{ hash, text: 'kys' }],
      },
      { cache, settingsStore, proxy },
    )

    expect(response.verdicts).toEqual([
      {
        hash,
        hide: true,
        status: 'hidden',
        reason: 'tier0_local_heuristic',
      },
    ])
    expect(proxy.calls).toEqual([])
    expect(await cache.get(hash)).toBeUndefined()
    expect(await settingsStore.get()).toMatchObject({
      hiddenCounts: { byVerdict: 1, awaitingVerdict: 0 },
    })
  })

  it('keeps proxy-unclassified quota fallbacks hidden, awaiting, and out of the local cache', async () => {
    const cache = new MemoryLocalVectorCache()
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
      proxyToken: 'signed-token',
    })
    const hash = await hashMessageText('quota exhausted text')
    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'youtube_comments',
        messages: [{ hash, text: 'quota exhausted text' }],
      },
      {
        cache,
        settingsStore,
        proxy: recordingProxyResults([{ status: 'unclassified', reason: 'quota_exhausted' }]),
      },
    )

    expect(response.verdicts).toEqual([
      { hash, hide: true, status: 'unclassified', reason: 'quota_exhausted' },
    ])
    expect(await cache.get(hash)).toBeUndefined()
    expect(await settingsStore.get()).toMatchObject({
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 1 },
    })
  })

  it('refilters cached vectors after a preset change without calling the proxy', async () => {
    const cache = new MemoryLocalVectorCache()
    await cache.put({
      hash: await hashMessageText('borderline insult'),
      text: 'borderline insult',
      serviceId: 'x_dms',
      classification: classification({ insult: 0.7 }),
    })
    const aggressive = await refilterCachedMessages(cache, {
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
    })
    const balanced = await refilterCachedMessages(cache, {
      defaultPreset: 'balanced',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
    })

    expect(aggressive).toEqual([{ hash: await hashMessageText('borderline insult'), hide: true }])
    expect(balanced).toEqual([{ hash: await hashMessageText('borderline insult'), hide: false }])
  })

  it('applies the NSFW site profile in the extension path', async () => {
    const cache = new MemoryLocalVectorCache()
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
      proxyToken: 'signed-token',
    })
    const explicitHash = await hashMessageText('explicit fixture')
    const degradingHash = await hashMessageText('degrading fixture')

    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'onlyfans_comments',
        messages: [
          { hash: explicitHash, text: 'explicit fixture' },
          { hash: degradingHash, text: 'degrading fixture' },
        ],
      },
      {
        cache,
        settingsStore,
        proxy: recordingProxy([
          classification({ sexual_explicit: 0.95 }),
          classification({ sexual_degrading: 0.95 }),
        ]),
      },
    )

    expect(response.verdicts).toEqual([
      { hash: explicitHash, hide: false, status: 'classified' },
      { hash: degradingHash, hide: true, status: 'classified' },
    ])
  })

  it('popup state exposes count and settings without hidden message details', async () => {
    const state = await popupState(
      new MemorySettingsStore({
        defaultPreset: 'balanced',
        servicePresetOverrides: { onlyfans_dms: 'off' },
        hiddenCounts: { byVerdict: 7, awaitingVerdict: 2 },
        proxyUrl: 'https://proxy.example',
      }),
    )

    expect(state).toEqual({
      type: 'serenity.popupStateResult',
      currentPreset: 'balanced',
      servicePresetOverrides: { onlyfans_dms: 'off' },
      hiddenCount: 9,
    })
    expect(JSON.stringify(state)).not.toContain('text')
    expect(JSON.stringify(state)).not.toContain('reason')
  })

  it('setting changes refilter cached vectors and update count without proxy calls', async () => {
    const cache = new MemoryLocalVectorCache()
    const proxy = recordingProxy([])
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
    })
    await cache.put({
      hash: await hashMessageText('borderline insult'),
      text: 'borderline insult',
      serviceId: 'x_dms',
      classification: classification({ insult: 0.7 }),
    })

    const state = await handleRuntimeMessage(
      { type: 'serenity.setDefaultPreset', preset: 'balanced' },
      { cache, settingsStore, proxy },
    )

    expect(state).toMatchObject({
      type: 'serenity.popupStateResult',
      currentPreset: 'balanced',
      hiddenCount: 0,
    })
    expect(proxy.calls).toEqual([])
  })

  it('keeps awaiting-verdict hidden count separate from verdict-hidden count', async () => {
    const settingsStore = new MemorySettingsStore({
      defaultPreset: 'aggressive',
      servicePresetOverrides: {},
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
      proxyUrl: 'https://proxy.example',
    })

    await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [
          {
            hash: await hashMessageText('pending text'),
            text: 'pending text',
          },
        ],
      },
      {
        cache: new MemoryLocalVectorCache(),
        settingsStore,
        proxy: recordingProxy([], { registerError: new Error('offline') }),
        createInstallId: () => '123e4567-e89b-12d3-a456-426614174000',
      },
    )

    expect(await settingsStore.get()).toMatchObject({
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 1 },
    })
    expect(await popupState(settingsStore)).toMatchObject({ hiddenCount: 1 })
  })
})

function recordingProxy(
  classifications: Classification[],
  options: { token?: string; registerError?: Error } = {},
) {
  return recordingProxyResults(
    classifications.map((item) => ({ status: 'classified', classification: item })),
    options,
  )
}

function recordingProxyResults(
  results: ProxyClassifyResult[],
  options: { token?: string; registerError?: Error } = {},
) {
  const calls: Array<{
    messages: readonly string[]
    token: string
    proxyUrl: string
  }> = []
  const registerCalls: Array<{
    installId: string
    proxyUrl: string
  }> = []
  const proxy: ProxyClient & {
    calls: typeof calls
    registerCalls: typeof registerCalls
  } = {
    calls,
    registerCalls,
    async registerInstall(installId, proxyUrl) {
      registerCalls.push({ installId, proxyUrl })
      if (options.registerError !== undefined) throw options.registerError
      return { token: options.token ?? 'registered-token' }
    },
    async classify(messages, token, proxyUrl) {
      calls.push({ messages, token, proxyUrl })
      return { results }
    },
  }
  return proxy
}

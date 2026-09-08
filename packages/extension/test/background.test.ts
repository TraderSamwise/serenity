import { describe, expect, it } from 'vitest'
import { HIDE_OPTIMISTICALLY } from '@serenity/core'
import type { Classification } from '@serenity/core'
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
      hiddenCount: 0,
      proxyUrl: 'https://proxy.example',
      proxyToken: 'signed-token',
    })

    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [
          { stableId: 'a', text: 'same bad text' },
          { stableId: 'b', text: 'same bad text' },
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
    expect(response.optimisticHide).toBe(HIDE_OPTIMISTICALLY)
    expect(response.verdicts).toEqual([
      { stableId: 'a', hide: true },
      { stableId: 'b', hide: true },
    ])
    expect(JSON.stringify(response)).not.toContain('same bad text')
    expect(JSON.stringify(response)).not.toContain('insult')
  })

  it('keeps uncached messages hidden when no proxy token is available', async () => {
    const response = await handleClassifyMessages(
      {
        type: 'serenity.classifyMessages',
        serviceId: 'x_dms',
        messages: [{ stableId: 'a', text: 'unclassified text' }],
      },
      {
        cache: new MemoryLocalVectorCache(),
        settingsStore: new MemorySettingsStore(),
        proxy: recordingProxy([]),
      },
    )

    expect(response).toMatchObject({
      optimisticHide: true,
      verdicts: [{ stableId: 'a', hide: true }],
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
      hiddenCount: 0,
      proxyUrl: 'https://proxy.example',
    })
    const balanced = await refilterCachedMessages(cache, {
      defaultPreset: 'balanced',
      servicePresetOverrides: {},
      hiddenCount: 0,
      proxyUrl: 'https://proxy.example',
    })

    expect(aggressive).toEqual([{ stableId: await hashMessageText('borderline insult'), hide: true }])
    expect(balanced).toEqual([{ stableId: await hashMessageText('borderline insult'), hide: false }])
  })

  it('popup state exposes count and settings without hidden message details', async () => {
    const state = await popupState(
      new MemorySettingsStore({
        defaultPreset: 'balanced',
        servicePresetOverrides: { onlyfans_dms: 'off' },
        hiddenCount: 9,
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
      hiddenCount: 0,
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
})

function recordingProxy(classifications: Classification[]) {
  const calls: Array<{
    messages: readonly string[]
    token: string
    proxyUrl: string
  }> = []
  const proxy: ProxyClient & { calls: typeof calls } = {
    calls,
    async classify(messages, token, proxyUrl) {
      calls.push({ messages, token, proxyUrl })
      return { classifications }
    },
  }
  return proxy
}

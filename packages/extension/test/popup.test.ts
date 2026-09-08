import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import type { ExtensionRequest, PopupStateResponse } from '@serenity/core'
import { wirePopup } from '../src/popup'

type StorageListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void

describe('popup', () => {
  it('refreshes the hidden count while the popup is open', async () => {
    const dom = new JSDOM(popupHtml())
    const states: PopupStateResponse[] = [
      popupState(0),
      popupState(3),
    ]
    const runtime = {
      async sendMessage(_message: ExtensionRequest): Promise<PopupStateResponse> {
        return states.shift() ?? popupState(3)
      },
    }
    const listeners: StorageListener[] = []
    const storage = {
      onChanged: {
        addListener(callback: StorageListener): void {
          listeners.push(callback)
        },
      },
    }

    await wirePopup(dom.window.document, runtime, storage)
    expect(dom.window.document.getElementById('hidden-count')?.textContent).toBe('0')

    expect(listeners).toHaveLength(1)
    listeners[0]!({}, 'local')
    await Promise.resolve()

    expect(dom.window.document.getElementById('hidden-count')?.textContent).toBe('3')
  })
})

function popupState(hiddenCount: number): PopupStateResponse {
  return {
    type: 'serenity.popupStateResult',
    currentPreset: 'aggressive',
    servicePresetOverrides: {},
    hiddenCount,
  }
}

function popupHtml(): string {
  return [
    '<main>',
    '<label><select id="current-preset"></select></label>',
    '<section id="service-overrides"></section>',
    '<output id="hidden-count">0</output>',
    '</main>',
  ].join('')
}

import { PRESETS } from '@serenity/core'
import type { PresetName, ServiceId } from '@serenity/core'

export interface ExtensionSettings {
  defaultPreset: PresetName
  servicePresetOverrides: Partial<Record<ServiceId, PresetName>>
  hiddenCount: number
  proxyUrl: string
  proxyToken?: string
  installId?: string
}

export interface SettingsStore {
  get(): Promise<ExtensionSettings>
  set(settings: ExtensionSettings): Promise<void>
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  defaultPreset: 'aggressive',
  servicePresetOverrides: {},
  hiddenCount: 0,
  proxyUrl: 'http://localhost:8787',
}

export class MemorySettingsStore implements SettingsStore {
  constructor(private settings: ExtensionSettings = DEFAULT_EXTENSION_SETTINGS) {}

  async get(): Promise<ExtensionSettings> {
    return structuredClone(this.settings)
  }

  async set(settings: ExtensionSettings): Promise<void> {
    this.settings = structuredClone(settings)
  }
}

export class ChromeSettingsStore implements SettingsStore {
  constructor(private readonly storage = chrome.storage.local) {}

  async get(): Promise<ExtensionSettings> {
    const stored = await this.storage.get(DEFAULT_EXTENSION_SETTINGS)
    return {
      ...DEFAULT_EXTENSION_SETTINGS,
      ...stored,
      servicePresetOverrides: {
        ...DEFAULT_EXTENSION_SETTINGS.servicePresetOverrides,
        ...stored.servicePresetOverrides,
      },
    } as ExtensionSettings
  }

  async set(settings: ExtensionSettings): Promise<void> {
    await this.storage.set(settings)
  }
}

export function presetForService(settings: ExtensionSettings, serviceId: ServiceId) {
  return PRESETS[settings.servicePresetOverrides[serviceId] ?? settings.defaultPreset]
}

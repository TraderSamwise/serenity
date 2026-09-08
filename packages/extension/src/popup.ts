import { SERVICES, PRESETS } from '@serenity/core'
import type {
  ExtensionRequest,
  PopupStateResponse,
  PresetName,
  ServiceId,
} from '@serenity/core'

interface RuntimeMessenger {
  sendMessage(message: ExtensionRequest): Promise<PopupStateResponse>
}
type StorageListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
interface StorageChangeSource {
  onChanged: {
    addListener(listener: StorageListener): void
  }
}

export async function wirePopup(
  document: Document,
  runtime: RuntimeMessenger = chrome.runtime as RuntimeMessenger,
  storage: StorageChangeSource = chrome.storage as StorageChangeSource,
): Promise<void> {
  const state = await sendMessage(runtime, { type: 'serenity.popupState' })
  renderPopupState(document, state)
  storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== 'local') return
    void sendMessage(runtime, { type: 'serenity.popupState' }).then((nextState) => {
      renderPopupState(document, nextState)
    })
  })
  selectElement(document, 'current-preset').addEventListener('change', async (event) => {
    const select = event.currentTarget as HTMLSelectElement
    renderPopupState(
      document,
      await sendMessage(runtime, {
        type: 'serenity.setDefaultPreset',
        preset: select.value as PresetName,
      }),
    )
  })
  element(document, 'service-overrides').addEventListener('change', async (event) => {
    const select = event.target
    if (!(select instanceof HTMLSelectElement)) return
    const serviceId = select.dataset.serviceId as ServiceId
    renderPopupState(
      document,
      await sendMessage(runtime, {
        type: 'serenity.setServicePresetOverride',
        serviceId,
        preset: select.value === '' ? null : (select.value as PresetName),
      }),
    )
  })
}

export function renderPopupState(document: Document, state: PopupStateResponse): void {
  const presetSelect = selectElement(document, 'current-preset')
  presetSelect.replaceChildren(...presetOptions(document, state.currentPreset))

  const overrides = element(document, 'service-overrides')
  overrides.replaceChildren(
    ...Object.values(SERVICES).map((service) =>
      serviceOverrideRow(
        document,
        service.id,
        service.label,
        state.servicePresetOverrides[service.id],
      ),
    ),
  )

  element(document, 'hidden-count').textContent = String(state.hiddenCount)
}

function serviceOverrideRow(
  document: Document,
  serviceId: ServiceId,
  label: string,
  selected: keyof typeof PRESETS | undefined,
): HTMLElement {
  const row = document.createElement('label')
  row.dataset.serviceId = serviceId
  row.textContent = label
  const select = document.createElement('select')
  select.name = `override-${serviceId}`
  select.dataset.serviceId = serviceId
  select.replaceChildren(
    option(document, '', 'Default', selected === undefined),
    ...presetOptions(document, selected),
  )
  row.append(select)
  return row
}

function sendMessage(runtime: RuntimeMessenger, message: ExtensionRequest) {
  return runtime.sendMessage(message) as Promise<PopupStateResponse>
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  void wirePopup(document)
}

function presetOptions(document: Document, selected: keyof typeof PRESETS | undefined) {
  return Object.keys(PRESETS).map((preset) => option(document, preset, preset, preset === selected))
}

function option(
  document: Document,
  value: string,
  label: string,
  selected: boolean,
): HTMLOptionElement {
  const item = document.createElement('option')
  item.value = value
  item.textContent = label
  item.selected = selected
  return item
}

function selectElement(document: Document, id: string): HTMLSelectElement {
  const found = element(document, id)
  const view = document.defaultView
  if (view === null || !(found instanceof view.HTMLSelectElement)) {
    throw new Error(`Missing select #${id}.`)
  }
  return found
}

function element(document: Document, id: string): HTMLElement {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`Missing element #${id}.`)
  return found
}

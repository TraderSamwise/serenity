import type {
  ClassifyMessagesRequest,
  ClassifyMessagesResponse,
  ExtractedMessage,
} from '@serenity/core'
import { hashMessageText } from './hash'
import { SERVICE_SELECTOR_DEFINITIONS } from './selectors'
import type { ServiceSelectorDefinition } from './selectors'

export interface RuntimeMessenger {
  sendMessage(message: ClassifyMessagesRequest): Promise<ClassifyMessagesResponse>
}

export class SerenityContentScript {
  private processed = new WeakSet<Element>()
  private observers: MutationObserver[] = []
  private observedDocuments = new WeakSet<Document>()
  private observedScrollDocuments = new WeakSet<Document>()
  private scrollListeners: Array<{ target: EventTarget; listener: () => void }> = []
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private scanQueued = false

  constructor(
    private readonly document: Document,
    private readonly definition: ServiceSelectorDefinition,
    private readonly runtime: RuntimeMessenger,
    private readonly observerCtor: typeof MutationObserver = MutationObserver,
    private readonly unclassifiedRetryMs = 60_000,
  ) {}

  start(): void {
    this.injectDefaultHideStyles()
    void this.scan()
    this.observeAvailableDocuments()
  }

  stop(): void {
    for (const observer of this.observers) observer.disconnect()
    this.observers = []
    this.observedDocuments = new WeakSet<Document>()
    for (const { target, listener } of this.scrollListeners) {
      target.removeEventListener('scroll', listener, true)
    }
    this.scrollListeners = []
    this.observedScrollDocuments = new WeakSet<Document>()
    if (this.retryTimer !== null) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.scanQueued = false
  }

  async scan(): Promise<void> {
    this.injectDefaultHideStyles()
    const extracted = await this.extract(collectRows(this.targetDocuments(), this.definition))
    if (extracted.length === 0) return

    let response
    try {
      response = await this.runtime.sendMessage({
        type: 'serenity.classifyMessages',
        serviceId: this.definition.serviceId,
        messages: extracted.map(({ hash, text }) => ({ hash, text })),
      })
    } catch {
      for (const { row } of extracted) this.processed.delete(row)
      this.scheduleRetry()
      return
    }
    if (response.type !== 'serenity.classifyMessagesResult') {
      for (const { row } of extracted) this.processed.delete(row)
      this.scheduleRetry()
      return
    }

    const verdictsByHash = new Map(response.verdicts.map((verdict) => [verdict.hash, verdict]))
    let sawUnclassified = false
    for (const { row, hash } of extracted) {
      const verdict = verdictsByHash.get(hash)
      if (verdict === undefined || verdict.status === 'unclassified') {
        sawUnclassified = true
        this.processed.delete(row)
        continue
      }
      applyVerdict(row, verdict.hide)
    }
    if (sawUnclassified) this.scheduleRetry()
  }

  async refilter(): Promise<void> {
    this.processed = new WeakSet<Element>()
    for (const row of collectRows(this.targetDocuments(), this.definition)) {
      delete (row as HTMLElement).dataset.serenityHidden
    }
    await this.scan()
  }

  private async extract(rows: readonly Element[]): Promise<ExtractedRow[]> {
    const messages: ExtractedRow[] = []
    for (const row of rows) {
      if (this.processed.has(row)) continue
      const text = extractText(row, this.definition)
      if (text === null) {
        if (this.definition.textSelector === undefined) {
          this.processed.add(row)
          applyVerdict(row, false)
        }
        continue
      }
      this.processed.add(row)
      messages.push({ row, hash: await hashMessageText(text), text })
    }
    return messages
  }

  private observeAvailableDocuments(): void {
    for (const targetDocument of this.observableDocuments()) {
      if (this.observedDocuments.has(targetDocument)) continue
      const root = targetDocument.documentElement
      if (root === null) continue
      const observer = new this.observerCtor(() => {
        this.injectDefaultHideStyles()
        this.observeAvailableDocuments()
        this.queueScan()
      })
      observer.observe(root, { childList: true, subtree: true })
      this.observers.push(observer)
      this.observedDocuments.add(targetDocument)
      this.observeScrollDocument(targetDocument)
    }
  }

  private observeScrollDocument(document: Document): void {
    if (this.observedScrollDocuments.has(document)) return
    const listener = () => this.queueScan()
    document.addEventListener('scroll', listener, true)
    this.scrollListeners.push({ target: document, listener })
    document.defaultView?.addEventListener('scroll', listener, true)
    if (document.defaultView !== null) {
      this.scrollListeners.push({ target: document.defaultView, listener })
    }
    this.observedScrollDocuments.add(document)
  }

  private queueScan(): void {
    if (this.scanQueued) return
    this.scanQueued = true
    setTimeout(() => {
      this.scanQueued = false
      void this.scan()
    }, 0)
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.scan()
    }, this.unclassifiedRetryMs)
  }

  private targetDocuments(): Document[] {
    if (this.definition.frameSelector === undefined) return [this.document]
    return Array.from(this.document.querySelectorAll(this.definition.frameSelector))
      .map((frame) => frameDocument(frame))
      .filter((document): document is Document => document !== null)
  }

  private observableDocuments(): Document[] {
    return [this.document, ...this.targetDocuments()]
  }

  private injectDefaultHideStyles(): void {
    for (const targetDocument of this.targetDocuments()) {
      injectDefaultHideStyles(targetDocument, this.definition)
    }
  }
}

interface ExtractedRow extends ExtractedMessage {
  row: Element
}

export function activeSelectorDefinition(
  locationHref: string,
  definitions: readonly ServiceSelectorDefinition[] = SERVICE_SELECTOR_DEFINITIONS,
): ServiceSelectorDefinition | null {
  return activeSelectorDefinitions(locationHref, definitions)[0] ?? null
}

export function activeSelectorDefinitions(
  locationHref: string,
  definitions: readonly ServiceSelectorDefinition[] = SERVICE_SELECTOR_DEFINITIONS,
): ServiceSelectorDefinition[] {
  return definitions.filter((definition) => new RegExp(definition.urlPattern).test(locationHref))
}

export function installSerenityContentScript(
  document: Document,
  runtime: RuntimeMessenger,
  observerCtor: typeof MutationObserver = MutationObserver,
): SerenityContentScript | null {
  const definition = activeSelectorDefinition(document.location.href)
  if (definition === null) return null

  const script = new SerenityContentScript(document, definition, runtime, observerCtor)
  script.start()
  return script
}

export function installSerenityContentScripts(
  document: Document,
  runtime: RuntimeMessenger,
  observerCtor: typeof MutationObserver = MutationObserver,
): SerenityContentScript[] {
  return activeSelectorDefinitions(document.location.href).map((definition) => {
    const script = new SerenityContentScript(document, definition, runtime, observerCtor)
    script.start()
    return script
  })
}

export function collectRows(
  documents: readonly Document[],
  definition: ServiceSelectorDefinition,
): Element[] {
  const selectors = [definition.rowSelector, ...(definition.nestedRowSelectors ?? [])]
  const seen = new Set<Element>()
  const rows: Element[] = []
  for (const document of documents) {
    for (const selector of selectors) {
      for (const row of document.querySelectorAll(selector)) {
        if (seen.has(row)) continue
        seen.add(row)
        rows.push(row)
      }
    }
  }
  return definition.skipFirstRow === true ? rows.slice(1) : rows
}

export function defaultHideCss(definition: ServiceSelectorDefinition): string {
  const selectors = [definition.rowSelector, ...(definition.nestedRowSelectors ?? [])]
    .map((selector) => `${selector}:not([data-serenity-hidden="shown"])`)
    .join(',\n')
  return `${selectors} { display: none !important; }`
}

export function shouldRefilterForStorageChanges(
  changes: Record<string, chrome.storage.StorageChange>,
): boolean {
  return changes.defaultPreset !== undefined || changes.servicePresetOverrides !== undefined
}

function injectDefaultHideStyles(
  document: Document,
  definition: ServiceSelectorDefinition,
): void {
  const id = `serenity-default-hide-${definition.serviceId}-${hashStyleKey(definition)}`
  if (document.getElementById(id) !== null) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = defaultHideCss(definition)
  document.documentElement.append(style)
}

function hashStyleKey(definition: ServiceSelectorDefinition): string {
  let hash = 0
  const key = `${definition.containerSelector}\n${definition.rowSelector}\n${definition.nestedRowSelectors?.join('\n') ?? ''}`
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function extractText(row: Element, definition: ServiceSelectorDefinition): string | null {
  const source = definition.textSelector === undefined ? row : row.querySelector(definition.textSelector)
  if (source === null) return null
  const text = source?.textContent?.trim() ?? ''
  return text.length === 0 ? null : text
}

function frameDocument(frame: Element): Document | null {
  const view = frame.ownerDocument.defaultView
  if (view === null || !(frame instanceof view.HTMLIFrameElement)) return null
  try {
    return frame.contentDocument
  } catch {
    return null
  }
}

function applyVerdict(row: Element, hide: boolean): void {
  const html = row as HTMLElement
  if (hide) {
    html.dataset.serenityHidden = 'verdict'
    return
  }
  html.dataset.serenityHidden = 'shown'
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined') {
  const runtime: RuntimeMessenger = {
    sendMessage(message) {
      return chrome.runtime.sendMessage(message)
    },
  }
  const scripts = installSerenityContentScripts(document, runtime)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !shouldRefilterForStorageChanges(changes)) return
    for (const script of scripts) void script.refilter()
  })
}

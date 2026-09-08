import type {
  ClassifyMessagesRequest,
  ClassifyMessagesResponse,
  ExtractedMessage,
  HashVerdict,
  RefilterCachedMessagesResponse,
} from '@serenity/core'
import { hashMessageText } from './hash'
import { SERVICE_SELECTOR_DEFINITIONS } from './selectors'
import type { ServiceSelectorDefinition } from './selectors'

export interface RuntimeMessenger {
  sendMessage(message: ClassifyMessagesRequest | { type: 'serenity.refilterCachedMessages' }): Promise<
    ClassifyMessagesResponse | RefilterCachedMessagesResponse
  >
}

export class SerenityContentScript {
  private readonly stableIdToHash = new Map<string, string>()
  private readonly sent = new Map<string, string>()
  private observer: MutationObserver | null = null

  constructor(
    private readonly document: Document,
    private readonly definition: ServiceSelectorDefinition,
    private readonly runtime: RuntimeMessenger,
    private readonly observerCtor: typeof MutationObserver = MutationObserver,
  ) {}

  start(): void {
    void this.scan()
    this.observeContainer()
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
  }

  private observeContainer(): void {
    const container = this.document.querySelector(this.definition.containerSelector)
    if (container === null) {
      this.observeDocumentUntilContainerExists()
      return
    }

    this.observer?.disconnect()
    this.observer = new this.observerCtor(() => {
      void this.scan()
    })
    this.observer.observe(container, { childList: true, subtree: true })
  }

  private observeDocumentUntilContainerExists(): void {
    const root = this.document.documentElement
    if (root === null) return

    this.observer?.disconnect()
    this.observer = new this.observerCtor(() => {
      void this.scan()
      if (this.document.querySelector(this.definition.containerSelector) !== null) {
        this.observeContainer()
      }
    })
    this.observer.observe(root, { childList: true, subtree: true })
  }

  async scan(): Promise<void> {
    const rows = collectRows(this.document, this.definition)
    this.pruneKnownRows(rows)
    const extracted = await this.extract(rows)
    const unsent = extracted.filter((message) => this.sent.get(message.stableId) !== message.hash)
    if (unsent.length === 0) return

    for (const message of unsent) this.sent.set(message.stableId, message.hash)
    const response = await this.runtime.sendMessage({
      type: 'serenity.classifyMessages',
      serviceId: this.definition.serviceId,
      messages: unsent,
    })
    if (response.type !== 'serenity.classifyMessagesResult') return
    for (const verdict of response.verdicts) {
      this.applyStableIdVerdict(verdict.stableId, verdict.hide)
    }
  }

  async refilter(): Promise<void> {
    const response = await this.runtime.sendMessage({ type: 'serenity.refilterCachedMessages' })
    if (response.type !== 'serenity.refilterCachedMessagesResult') return
    for (const verdict of response.verdicts) this.applyHashVerdict(verdict)
  }

  private async extract(rows: readonly Element[]): Promise<ExtractedMessage[]> {
    const messages: ExtractedMessage[] = []
    for (const row of rows) {
      if (isExcludedLocationRow(row, this.definition, this.document.location.href)) continue
      const stableId = deriveStableId(row, this.definition, this.document.location.href)
      if (stableId === null) {
        hideRow(row, 'awaiting-id')
        continue
      }
      const text = extractText(row, this.definition)
      if (text === null) continue

      hideRow(row, 'awaiting-verdict')
      const hash = await hashMessageText(text)
      this.stableIdToHash.set(stableId, hash)
      messages.push({ stableId, hash, text })
    }
    return messages
  }

  private applyStableIdVerdict(stableId: string, hide: boolean): void {
    for (const row of this.currentRowsForStableId(stableId)) applyVerdict(row, hide)
  }

  private applyHashVerdict(verdict: HashVerdict): void {
    for (const [stableId, hash] of this.stableIdToHash) {
      if (hash === verdict.hash) this.applyStableIdVerdict(stableId, verdict.hide)
    }
  }

  private currentRowsForStableId(stableId: string): Element[] {
    return collectRows(this.document, this.definition).filter(
      (row) => deriveStableId(row, this.definition, this.document.location.href) === stableId,
    )
  }

  private pruneKnownRows(rows: readonly Element[]): void {
    const currentStableIds = new Set<string>()
    for (const row of rows) {
      const stableId = deriveStableId(row, this.definition, this.document.location.href)
      if (stableId !== null) currentStableIds.add(stableId)
    }
    for (const stableId of this.stableIdToHash.keys()) {
      if (!currentStableIds.has(stableId)) this.stableIdToHash.delete(stableId)
    }
    for (const stableId of this.sent.keys()) {
      if (!currentStableIds.has(stableId)) this.sent.delete(stableId)
    }
  }
}

export function activeSelectorDefinition(
  locationHref: string,
  definitions: readonly ServiceSelectorDefinition[] = SERVICE_SELECTOR_DEFINITIONS,
): ServiceSelectorDefinition | null {
  return definitions.find((definition) => new RegExp(definition.urlPattern).test(locationHref)) ?? null
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

export function deriveStableId(
  row: Element,
  definition: ServiceSelectorDefinition,
  locationHref: string,
): string | null {
  if (definition.stableId.type === 'react-prop') return deriveReactPropStableId(row, definition)
  return deriveAttributeStableId(row, definition)
}

function collectRows(document: Document, definition: ServiceSelectorDefinition): Element[] {
  const selectors = [definition.rowSelector, ...(definition.nestedRowSelectors ?? [])]
  const seen = new Set<Element>()
  const rows: Element[] = []
  for (const selector of selectors) {
    for (const row of document.querySelectorAll(selector)) {
      if (seen.has(row)) continue
      seen.add(row)
      rows.push(row)
    }
  }
  return rows
}

function deriveAttributeStableId(
  row: Element,
  definition: ServiceSelectorDefinition,
): string | null {
  if (definition.stableId.type !== 'attribute') return null
  const source = row.querySelector(definition.stableId.selector)
  const value = source?.getAttribute(definition.stableId.attribute)
  if (value === undefined || value === null) return null

  const match = new RegExp(definition.stableId.pattern).exec(value)
  if (match?.[1] === undefined) return null

  const stableId = `${definition.stableId.prefix}${decodeURIComponent(match[1])}`
  return stableId
}

function deriveReactPropStableId(
  row: Element,
  definition: ServiceSelectorDefinition,
): string | null {
  if (definition.stableId.type !== 'react-prop') return null
  const fiber = reactFiberFor(row)
  for (let current = fiber; current !== null; current = reactParentFiber(current)) {
    const value =
      readPath(reactProps(current, 'memoizedProps'), definition.stableId.propPath) ??
      readPath(reactProps(current, 'pendingProps'), definition.stableId.propPath)
    if (typeof value !== 'string') continue

    const match = new RegExp(definition.stableId.pattern).exec(value)
    if (match?.[1] !== undefined) return `${definition.stableId.prefix}${decodeURIComponent(match[1])}`
  }
  return null
}

export function isExcludedLocationRow(
  row: Element,
  definition: ServiceSelectorDefinition,
  locationHref: string,
): boolean {
  const current = deriveLocationStableId(definition, locationHref)
  return current !== null && deriveStableId(row, definition, locationHref) === current
}

function deriveLocationStableId(
  definition: ServiceSelectorDefinition,
  locationHref: string,
): string | null {
  const rule = definition.excludeStableIdFromLocation
  if (rule === undefined) return null
  const match = new RegExp(rule.pattern).exec(locationHref)
  return match?.[1] === undefined ? null : `${rule.prefix}${match[1]}`
}

function extractText(row: Element, definition: ServiceSelectorDefinition): string | null {
  const textNodes = Array.from(row.querySelectorAll(definition.textSelector))
  const values = textNodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean)
  if (values.length === 0) return null
  return definition.textMode === 'first' ? values[0]! : values.join('\n')
}

type ReactFiber = {
  return?: ReactFiber | null
  pendingProps?: unknown
  memoizedProps?: unknown
}

function reactFiberFor(row: Element): ReactFiber | null {
  const name = Object.getOwnPropertyNames(row).find((property) => property.startsWith('__reactFiber$'))
  return name === undefined ? null : ((row as unknown as Record<string, ReactFiber | undefined>)[name] ?? null)
}

function reactParentFiber(fiber: ReactFiber): ReactFiber | null {
  return fiber.return ?? null
}

function reactProps(fiber: ReactFiber, key: 'memoizedProps' | 'pendingProps'): unknown {
  return fiber[key]
}

function readPath(source: unknown, path: readonly string[]): unknown {
  let current = source
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function hideRow(row: Element, state: 'awaiting-id' | 'awaiting-verdict'): void {
  const html = row as HTMLElement
  html.dataset.serenityHidden = state
  html.style.display = 'none'
}

function applyVerdict(row: Element, hide: boolean): void {
  const html = row as HTMLElement
  if (hide) {
    html.dataset.serenityHidden = 'verdict'
    html.style.display = 'none'
    return
  }
  html.dataset.serenityHidden = 'shown'
  html.style.removeProperty('display')
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined') {
  const runtime: RuntimeMessenger = {
    sendMessage(message) {
      return chrome.runtime.sendMessage(message)
    },
  }
  const script = installSerenityContentScript(document, runtime)
  chrome.storage.onChanged.addListener(() => {
    void script?.refilter()
  })
}

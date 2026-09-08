import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import type {
  ClassifyMessagesRequest,
  ClassifyMessagesResponse,
  RefilterCachedMessagesResponse,
} from '@serenity/core'
import {
  SerenityContentScript,
  activeSelectorDefinition,
  deriveStableId,
  isExcludedLocationRow,
} from '../src/content-script'
import { hashMessageText } from '../src/hash'
import { X_OWN_POST_COMMENT_SELECTORS } from '../src/selectors'
import type { RuntimeMessenger } from '../src/content-script'

describe('X content script', () => {
  it('uses live-verified X status links as stable ids and skips the main post', () => {
    const dom = xStatusDom()
    const rows = [...dom.window.document.querySelectorAll('article[data-testid="tweet"]')]

    expect(activeSelectorDefinition(dom.window.location.href)).toBe(
      X_OWN_POST_COMMENT_SELECTORS,
    )
    expect(isExcludedLocationRow(rows[0]!, X_OWN_POST_COMMENT_SELECTORS, dom.window.location.href)).toBe(true)
    expect(deriveStableId(rows[1]!, X_OWN_POST_COMMENT_SELECTORS, dom.window.location.href)).toBe('x-status:222')
  })

  it('hides optimistically before the worker returns and unhides only on explicit show', async () => {
    const dom = xStatusDom()
    let resolveResponse: (response: ClassifyMessagesResponse) => void = () => {}
    const pending = new Promise<ClassifyMessagesResponse>((resolve) => {
      resolveResponse = resolve
    })
    const runtime = recordingRuntime(async () => pending)
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const reply = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement

    const scan = script.scan()
    expect(reply.style.display).toBe('none')
    expect(reply.dataset.serenityHidden).toBe('awaiting-verdict')
    await waitFor(() => runtime.calls.length === 1)
    expect(runtime.calls[0]).toMatchObject({
      type: 'serenity.classifyMessages',
      serviceId: 'x_own_post_comments',
    })
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0]).toMatchObject({
      stableId: 'x-status:222',
      hash: await hashMessageText('Constructive but blunt reply'),
      text: 'Constructive but blunt reply',
    })

    resolveResponse({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [{ stableId: 'x-status:222', hide: false }],
    })
    await scan

    expect(reply.style.display).toBe('')
    expect(reply.dataset.serenityHidden).toBe('shown')
  })

  it('keeps hash ownership in the content script for refilter responses', async () => {
    const dom = xStatusDom()
    const hash = await hashMessageText('Constructive but blunt reply')
    const runtime = recordingRuntime(async (message) => {
      if (message.type === 'serenity.refilterCachedMessages') {
        return {
          type: 'serenity.refilterCachedMessagesResult',
          verdicts: [{ hash, hide: true }],
        } satisfies RefilterCachedMessagesResponse
      }
      return {
        type: 'serenity.classifyMessagesResult',
        optimisticHide: true,
        verdicts: [{ stableId: 'x-status:222', hide: false }],
      } satisfies ClassifyMessagesResponse
    })
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const reply = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement

    await script.scan()
    expect(reply.dataset.serenityHidden).toBe('shown')
    await script.refilter()

    expect(reply.style.display).toBe('none')
    expect(reply.dataset.serenityHidden).toBe('verdict')
  })
})

function xStatusDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <main>
        <div data-testid="primaryColumn">
          <article data-testid="tweet">
            <a href="/TraderSamwise/status/111"></a>
            <div data-testid="tweetText">Creator post</div>
          </article>
          <article data-testid="tweet">
            <a href="/replyAuthor/status/222"></a>
            <div data-testid="tweetText">Constructive but blunt reply</div>
          </article>
        </div>
      </main>`,
    { url: 'https://x.com/TraderSamwise/status/111' },
  )
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for predicate.')
}

function recordingRuntime(
  reply: RuntimeMessenger['sendMessage'],
): RuntimeMessenger & { calls: Array<Parameters<RuntimeMessenger['sendMessage']>[0]> } {
  const calls: Array<Parameters<RuntimeMessenger['sendMessage']>[0]> = []
  return {
    calls,
    async sendMessage(message) {
      calls.push(message)
      return reply(message)
    },
  }
}

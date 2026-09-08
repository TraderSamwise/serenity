import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
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
  activeSelectorDefinitions,
  deriveStableId,
  installSerenityContentScripts,
  isExcludedLocationRow,
} from '../src/content-script'
import { hashMessageText } from '../src/hash'
import {
  ONLYFANS_COMMENT_SELECTORS,
  ONLYFANS_DM_SELECTORS,
  TWITCH_CHAT_SELECTORS,
  X_OWN_POST_COMMENT_SELECTORS,
  YOUTUBE_COMMENT_SELECTORS,
  YOUTUBE_LIVE_CHAT_SELECTORS,
} from '../src/selectors'
import type { RuntimeMessenger } from '../src/content-script'

const contentScriptPath = fileURLToPath(new URL('../src/content-script.ts', import.meta.url))

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
      verdicts: [{ stableId: 'x-status:222', hide: false, status: 'classified' }],
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
        verdicts: [{ stableId: 'x-status:222', hide: false, status: 'classified' }],
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

  it('retries a row when the worker message fails before a verdict arrives', async () => {
    const dom = xStatusDom()
    let attempts = 0
    const runtime = recordingRuntime(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('worker unavailable')
      return {
        type: 'serenity.classifyMessagesResult',
        optimisticHide: true,
        verdicts: [{ stableId: 'x-status:222', hide: false, status: 'classified' }],
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
    expect(reply.dataset.serenityHidden).toBe('awaiting-verdict')
    await script.scan()

    expect(runtime.calls).toHaveLength(2)
    expect(reply.dataset.serenityHidden).toBe('shown')
  })

  it('keeps unclassified rows hidden and retries them later', async () => {
    const dom = xStatusDom()
    let attempts = 0
    const runtime = recordingRuntime(async () => {
      attempts += 1
      if (attempts === 1) {
        return {
          type: 'serenity.classifyMessagesResult',
          optimisticHide: true,
          verdicts: [
            {
              stableId: 'x-status:222',
              hide: true,
              status: 'unclassified',
              reason: 'quota_exhausted',
            },
          ],
        } satisfies ClassifyMessagesResponse
      }
      return {
        type: 'serenity.classifyMessagesResult',
        optimisticHide: true,
        verdicts: [{ stableId: 'x-status:222', hide: false, status: 'classified' }],
      } satisfies ClassifyMessagesResponse
    })
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
      0,
    )
    const reply = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement

    await script.scan()
    expect(reply.style.display).toBe('none')
    expect(reply.dataset.serenityHidden).toBe('awaiting-verdict')

    await waitFor(() => runtime.calls.length === 2)

    expect(reply.style.display).toBe('')
    expect(reply.dataset.serenityHidden).toBe('shown')
    script.stop()
  })

  it('applies cached hash verdicts when a row changed before the stable-id verdict lands', async () => {
    const dom = xStatusDom()
    const hash = await hashMessageText('Constructive but blunt reply')
    let resolveResponse: (response: ClassifyMessagesResponse) => void = () => {}
    const pending = new Promise<ClassifyMessagesResponse>((resolve) => {
      resolveResponse = resolve
    })
    const runtime = recordingRuntime(async (message) => {
      if (message.type === 'serenity.refilterCachedMessages') {
        return {
          type: 'serenity.refilterCachedMessagesResult',
          verdicts: [{ hash, hide: false }],
        } satisfies RefilterCachedMessagesResponse
      }
      return pending
    })
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    const scan = script.scan()
    await waitFor(() => runtime.calls.length === 1)
    const column = dom.window.document.querySelector('[data-testid="primaryColumn"]')!
    column.innerHTML = `
      <article data-testid="tweet">
        <a href="/TraderSamwise/status/111"></a>
        <div data-testid="tweetText">Creator post</div>
      </article>
      <article data-testid="tweet">
        <a href="/replyAuthor/status/333"></a>
        <div data-testid="tweetText">Constructive but blunt reply</div>
      </article>`
    void script.scan()
    await waitFor(() => runtime.calls.length === 2)

    resolveResponse({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [{ stableId: 'x-status:222', hide: false, status: 'classified' }],
    })
    await scan

    const replacement = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement
    expect(replacement.dataset.serenityHidden).toBe('shown')
  })
})

describe('YouTube comments content script', () => {
  it('uses lc permalinks as stable ids for parent comments and expanded replies', () => {
    const dom = youtubeCommentsDom()
    const rows = [...dom.window.document.querySelectorAll('ytd-comment-view-model#comment')]

    expect(activeSelectorDefinition(dom.window.location.href)).toBe(YOUTUBE_COMMENT_SELECTORS)
    expect(deriveStableId(rows[0]!, YOUTUBE_COMMENT_SELECTORS, dom.window.location.href)).toBe(
      'youtube-comment:UgxParent.001',
    )
    expect(deriveStableId(rows[1]!, YOUTUBE_COMMENT_SELECTORS, dom.window.location.href)).toBe(
      'youtube-comment:UgxReply.002',
    )
  })

  it('classifies expanded replies as rows without a YouTube-specific content-script branch', async () => {
    const dom = youtubeCommentsDom()
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [
        { stableId: 'youtube-comment:UgxParent.001', hide: false, status: 'classified' },
        { stableId: 'youtube-comment:UgxReply.002', hide: true, status: 'classified' },
      ],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const rows = [...dom.window.document.querySelectorAll('ytd-comment-view-model#comment')] as HTMLElement[]

    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.serviceId).toBe('youtube_comments')
    expect(sent.messages).toEqual([
      {
        stableId: 'youtube-comment:UgxParent.001',
        hash: await hashMessageText('Parent comment text'),
        text: 'Parent comment text',
      },
      {
        stableId: 'youtube-comment:UgxReply.002',
        hash: await hashMessageText('Expanded reply text'),
        text: 'Expanded reply text',
      },
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')
    expect(rows[1]!.dataset.serenityHidden).toBe('verdict')

    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain('youtube_comments')
    expect(source).not.toContain('YOUTUBE')
  })

  it('waits for lazy-loaded comments before observing rows', async () => {
    const dom = new JSDOM('<!doctype html><ytd-watch-flexy></ytd-watch-flexy>', {
      url: 'https://www.youtube.com/watch?v=abc123',
    })
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [{ stableId: 'youtube-comment:UgxLazy.003', hide: false, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    script.start()
    dom.window.document.querySelector('ytd-watch-flexy')!.innerHTML = `
      <ytd-comments id="comments">
        <ytd-comment-thread-renderer>
          <div id="comment-container">
            <ytd-comment-view-model id="comment">
              <a href="/watch?v=abc123&lc=UgxLazy.003"></a>
              <yt-formatted-string id="content-text">Late loaded comment</yt-formatted-string>
            </ytd-comment-view-model>
          </div>
        </ytd-comment-thread-renderer>
      </ytd-comments>`

    await waitFor(() => runtime.calls.length === 1)
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.messages[0]).toMatchObject({
      stableId: 'youtube-comment:UgxLazy.003',
      text: 'Late loaded comment',
    })
    script.stop()
  })
})

describe('YouTube live chat content script', () => {
  it('runs comments and live chat as separate selector definitions on watch pages', () => {
    expect(activeSelectorDefinitions('https://www.youtube.com/watch?v=abc123')).toEqual([
      YOUTUBE_COMMENT_SELECTORS,
      YOUTUBE_LIVE_CHAT_SELECTORS,
    ])
  })

  it('extracts live chat rows from the same-origin iframe and ignores system renderers', async () => {
    const dom = youtubeLiveChatDom()
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [
        { stableId: 'youtube-live-chat:yt-live-1', hide: false, status: 'classified' },
        { stableId: 'youtube-live-chat:yt-live-2', hide: true, status: 'classified' },
      ],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_LIVE_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const frameDocument = iframeDocument(dom)
    const rows = [
      ...frameDocument.querySelectorAll('yt-live-chat-text-message-renderer[id]'),
    ] as HTMLElement[]

    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.serviceId).toBe('youtube_live_chat')
    expect(sent.messages).toEqual([
      {
        stableId: 'youtube-live-chat:yt-live-1',
        hash: await hashMessageText('First live chat line'),
        text: 'First live chat line',
      },
      {
        stableId: 'youtube-live-chat:yt-live-2',
        hash: await hashMessageText('Second live chat line'),
        text: 'Second live chat line',
      },
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')
    expect(rows[1]!.dataset.serenityHidden).toBe('verdict')
    expect(frameDocument.querySelectorAll('yt-live-chat-viewer-engagement-message-renderer')).toHaveLength(1)

    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain('youtube_live_chat')
    expect(source).not.toContain('YOUTUBE_LIVE')
  })

  it('installs multiple watch-page service instances without conflating service ids', async () => {
    const dom = youtubeWatchDom()
    writeIframeDocument(
      dom,
      `<yt-live-chat-renderer>
        <div id="items">
          <yt-live-chat-text-message-renderer id="yt-live-1">
            <span id="author-name">author</span>
            <span id="message">First live chat line</span>
          </yt-live-chat-text-message-renderer>
        </div>
      </yt-live-chat-renderer>`,
    )
    const runtime = recordingRuntime(async (message) => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: (message as ClassifyMessagesRequest).messages.map((item) => ({
        stableId: item.stableId,
        hide: false,
        status: 'classified',
      })),
    }))

    const scripts = installSerenityContentScripts(
      dom.window.document,
      runtime,
      dom.window.MutationObserver,
    )
    await Promise.all(scripts.map((script) => script.scan()))

    expect(scripts).toHaveLength(2)
    expect(runtime.calls.map((message) => (message as ClassifyMessagesRequest).serviceId).sort()).toEqual([
      'youtube_comments',
      'youtube_live_chat',
    ])
  })

  it('prunes live-chat iframe rows removed while classification is in flight', async () => {
    const dom = youtubeLiveChatDom()
    let resolveResponse: (response: ClassifyMessagesResponse) => void = () => {}
    const pending = new Promise<ClassifyMessagesResponse>((resolve) => {
      resolveResponse = resolve
    })
    const runtime = recordingRuntime(async () => pending)
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_LIVE_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const frameDocument = iframeDocument(dom)

    const scan = script.scan()
    await waitFor(() => runtime.calls.length === 1)
    frameDocument
      .querySelectorAll('yt-live-chat-text-message-renderer[id]')
      .forEach((row) => row.remove())
    await script.scan()

    const internals = script as unknown as {
      stableIdToHash: Map<string, string>
      sent: Map<string, string>
    }
    expect(internals.stableIdToHash.size).toBe(0)
    expect(internals.sent.size).toBe(0)

    resolveResponse({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [{ stableId: 'youtube-live-chat:yt-live-1', hide: false, status: 'classified' }],
    })
    await scan

    expect(frameDocument.querySelectorAll('yt-live-chat-text-message-renderer[id]')).toHaveLength(0)
  })
})

describe('Twitch chat content script', () => {
  it('uses the Twitch message UUID from React props and ignores system rows by selector', () => {
    const dom = twitchChatDom()
    const rows = [...dom.window.document.querySelectorAll('[data-a-target="chat-line-message"]')]

    expect(activeSelectorDefinition(dom.window.location.href)).toBe(TWITCH_CHAT_SELECTORS)
    expect(rows).toHaveLength(2)
    expect(deriveStableId(rows[0]!, TWITCH_CHAT_SELECTORS, dom.window.location.href)).toBe(
      'twitch-message:11111111-1111-4111-8111-111111111111',
    )
    expect(dom.window.document.querySelectorAll('[data-a-target="chat-welcome-message"]')).toHaveLength(1)
  })

  it('classifies only chat rows without a Twitch-specific content-script branch', async () => {
    const dom = twitchChatDom()
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [
        {
          stableId: 'twitch-message:11111111-1111-4111-8111-111111111111',
          hide: false,
          status: 'classified',
        },
        {
          stableId: 'twitch-message:22222222-2222-4222-8222-222222222222',
          hide: true,
          status: 'classified',
        },
      ],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      TWITCH_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const rows = [...dom.window.document.querySelectorAll('[data-a-target="chat-line-message"]')] as HTMLElement[]

    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.serviceId).toBe('twitch_chat')
    expect(sent.messages).toEqual([
      {
        stableId: 'twitch-message:11111111-1111-4111-8111-111111111111',
        hash: await hashMessageText('First chat line'),
        text: 'First chat line',
      },
      {
        stableId: 'twitch-message:22222222-2222-4222-8222-222222222222',
        hash: await hashMessageText('Wave\nEmoteName'),
        text: 'Wave\nEmoteName',
      },
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')
    expect(rows[1]!.dataset.serenityHidden).toBe('verdict')

    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain('twitch_chat')
    expect(source).not.toContain('TWITCH')
  })

  it('prunes bookkeeping for rows removed while classification is in flight', async () => {
    const dom = twitchChatDom()
    let resolveResponse: (response: ClassifyMessagesResponse) => void = () => {}
    const pending = new Promise<ClassifyMessagesResponse>((resolve) => {
      resolveResponse = resolve
    })
    const runtime = recordingRuntime(async () => pending)
    const script = new SerenityContentScript(
      dom.window.document,
      TWITCH_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const scroller = dom.window.document.querySelector('[data-a-target="chat-scroller"]')!

    const scan = script.scan()
    await waitFor(() => runtime.calls.length === 1)
    scroller.querySelectorAll('[data-a-target="chat-line-message"]').forEach((row) => row.remove())
    await script.scan()

    const internals = script as unknown as {
      stableIdToHash: Map<string, string>
      sent: Map<string, string>
    }
    expect(internals.stableIdToHash.size).toBe(0)
    expect(internals.sent.size).toBe(0)

    resolveResponse({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [
        {
          stableId: 'twitch-message:11111111-1111-4111-8111-111111111111',
          hide: false,
          status: 'classified',
        },
      ],
    })
    await scan

    expect(scroller.querySelectorAll('[data-a-target="chat-line-message"]')).toHaveLength(0)
  })

  it('fails closed when the Twitch React message id is absent', async () => {
    const dom = new JSDOM(
      `<!doctype html>
        <div data-a-target="chat-scroller">
          <div data-a-target="chat-line-message" data-a-user="first">
            <span data-a-target="chat-message-text">Missing id line</span>
          </div>
        </div>`,
      { url: 'https://www.twitch.tv/live_channel' },
    )
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      TWITCH_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const row = dom.window.document.querySelector('[data-a-target="chat-line-message"]') as HTMLElement

    await script.scan()

    expect(runtime.calls).toEqual([])
    expect(row.style.display).toBe('none')
    expect(row.dataset.serenityHidden).toBe('awaiting-id')
  })
})

describe('OnlyFans content script', () => {
  it('models comments as a separate NSFW service with Vue comment ids', async () => {
    const dom = onlyFansCommentDom()
    const rows = [...dom.window.document.querySelectorAll('.b-comments__item')] as HTMLElement[]
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [
        { stableId: 'onlyfans-comment:324902863', hide: false, status: 'classified' },
        { stableId: 'onlyfans-comment:324875474', hide: true, status: 'classified' },
      ],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      ONLYFANS_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    expect(activeSelectorDefinition(dom.window.location.href)).toBe(ONLYFANS_COMMENT_SELECTORS)
    expect(deriveStableId(rows[0]!, ONLYFANS_COMMENT_SELECTORS, dom.window.location.href)).toBe(
      'onlyfans-comment:324902863',
    )

    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.serviceId).toBe('onlyfans_comments')
    expect(sent.messages).toEqual([
      {
        stableId: 'onlyfans-comment:324902863',
        hash: await hashMessageText('First comment fixture'),
        text: 'First comment fixture',
      },
      {
        stableId: 'onlyfans-comment:324875474',
        hash: await hashMessageText('Second comment fixture'),
        text: 'Second comment fixture',
      },
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')
    expect(rows[1]!.dataset.serenityHidden).toBe('verdict')

    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain('onlyfans_comments')
    expect(source).not.toContain('onlyfans_dms')
    expect(source).not.toContain('ONLYFANS')
  })

  it('uses Vue message ids for DMs, excludes timeline rows, and fails closed without an id', async () => {
    const dom = onlyFansDmDom()
    const rows = [...dom.window.document.querySelectorAll('.b-chat__messages .b-chat__message')] as HTMLElement[]
    const timelineRows = dom.window.document.querySelectorAll('.b-chat__message__system')
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      optimisticHide: true,
      verdicts: [{ stableId: 'onlyfans-message:11105260858545', hide: false, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      ONLYFANS_DM_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    expect(activeSelectorDefinition(dom.window.location.href)).toBe(ONLYFANS_DM_SELECTORS)
    expect(deriveStableId(rows[0]!, ONLYFANS_DM_SELECTORS, dom.window.location.href)).toBe(
      'onlyfans-message:11105260858545',
    )

    await script.scan()

    expect(timelineRows).toHaveLength(1)
    expect(runtime.calls).toHaveLength(1)
    const sent = runtime.calls[0] as ClassifyMessagesRequest
    expect(sent.serviceId).toBe('onlyfans_dms')
    expect(sent.messages).toEqual([
      {
        stableId: 'onlyfans-message:11105260858545',
        hash: await hashMessageText('DM fixture text'),
        text: 'DM fixture text',
      },
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')

    delete (rows[0] as unknown as { __vue__?: unknown }).__vue__
    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    expect(rows[0]!.style.display).toBe('none')
    expect(rows[0]!.dataset.serenityHidden).toBe('awaiting-id')
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

function youtubeCommentsDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <ytd-watch-flexy>
        <ytd-comments id="comments">
          <ytd-item-section-renderer id="sections">
            <ytd-comment-thread-renderer>
              <div id="comment-container">
                <ytd-comment-view-model id="comment">
                  <a id="published-time-text" href="/watch?v=abc123&lc=UgxParent.001"></a>
                  <yt-formatted-string id="content-text">Parent comment text</yt-formatted-string>
                </ytd-comment-view-model>
              </div>
              <ytd-comment-replies-renderer>
                <div id="expanded-threads">
                  <yt-sub-thread>
                    <ytd-comment-view-model id="comment">
                      <a id="published-time-text" href="/watch?v=abc123&lc=UgxReply%2E002"></a>
                      <yt-formatted-string id="content-text">Expanded reply text</yt-formatted-string>
                    </ytd-comment-view-model>
                  </yt-sub-thread>
                </div>
              </ytd-comment-replies-renderer>
            </ytd-comment-thread-renderer>
          </ytd-item-section-renderer>
        </ytd-comments>
      </ytd-watch-flexy>`,
    { url: 'https://www.youtube.com/watch?v=abc123' },
  )
}

function youtubeLiveChatDom(): JSDOM {
  const dom = youtubeWatchDom()
  writeIframeDocument(
    dom,
    `<yt-live-chat-app>
      <yt-live-chat-renderer>
        <div id="items">
          <yt-live-chat-viewer-engagement-message-renderer id="system-row">
            <div id="content">System row</div>
          </yt-live-chat-viewer-engagement-message-renderer>
          <yt-live-chat-text-message-renderer id="yt-live-1">
            <span id="author-name">first</span>
            <span id="message">First live chat line</span>
          </yt-live-chat-text-message-renderer>
          <yt-live-chat-text-message-renderer id="yt-live-2">
            <span id="author-name">second</span>
            <span id="message">Second live chat line</span>
          </yt-live-chat-text-message-renderer>
        </div>
      </yt-live-chat-renderer>
    </yt-live-chat-app>`,
  )
  return dom
}

function youtubeWatchDom(): JSDOM {
  const dom = new JSDOM(
    `<!doctype html>
      <ytd-watch-flexy>
        <ytd-comments id="comments">
          <ytd-item-section-renderer id="sections">
            <ytd-comment-thread-renderer>
              <div id="comment-container">
                <ytd-comment-view-model id="comment">
                  <a href="/watch?v=abc123&lc=UgxParent.001"></a>
                  <yt-formatted-string id="content-text">Parent comment text</yt-formatted-string>
                </ytd-comment-view-model>
              </div>
            </ytd-comment-thread-renderer>
          </ytd-item-section-renderer>
        </ytd-comments>
        <ytd-live-chat-frame id="chat">
          <iframe id="chatframe"></iframe>
        </ytd-live-chat-frame>
      </ytd-watch-flexy>`,
    {
      resources: 'usable',
      url: 'https://www.youtube.com/watch?v=abc123',
    },
  )
  return dom
}

function writeIframeDocument(dom: JSDOM, html: string): void {
  const frameDocument = iframeDocument(dom)
  frameDocument.open()
  frameDocument.write(`<!doctype html>${html}`)
  frameDocument.close()
}

function iframeDocument(dom: JSDOM): Document {
  const frame = dom.window.document.querySelector('iframe#chatframe') as HTMLIFrameElement | null
  const frameDocument = frame?.contentDocument
  if (frameDocument === undefined || frameDocument === null) throw new Error('Expected iframe document.')
  return frameDocument
}

function twitchChatDom(): JSDOM {
  const dom = new JSDOM(
    `<!doctype html>
      <main>
        <div data-a-target="chat-scroller" role="log">
          <div data-a-target="chat-welcome-message">Welcome row</div>
          <div data-a-target="chat-line-message" data-a-user="first" tabindex="0">
            <span data-a-target="chat-message-username">first</span>
            <span data-a-target="chat-line-message-body">
              <span data-a-target="chat-message-text">First chat line</span>
            </span>
          </div>
          <div data-a-target="chat-line-message" data-a-user="second" tabindex="0">
            <span data-a-target="chat-message-username">second</span>
            <span data-a-target="chat-line-message-body">
              <span data-a-target="chat-message-text">Wave</span>
              <span data-a-target="emote-name">EmoteName</span>
            </span>
          </div>
        </div>
      </main>`,
    { url: 'https://www.twitch.tv/live_channel' },
  )
  const rows = [...dom.window.document.querySelectorAll('[data-a-target="chat-line-message"]')]
  attachReactMessageId(rows[0]!, '11111111-1111-4111-8111-111111111111')
  attachReactMessageId(rows[1]!, '22222222-2222-4222-8222-222222222222')
  return dom
}

function onlyFansCommentDom(): JSDOM {
  const dom = new JSDOM(
    `<!doctype html>
      <div class="b-comments__list">
        <div class="b-comments__item m-break-word g-position-relative">
          <div class="b-comments__item-text">First comment fixture</div>
        </div>
        <div class="b-comments__item m-break-word g-position-relative">
          <div class="b-comments__item-text">Second comment fixture</div>
        </div>
      </div>`,
    { url: 'https://onlyfans.com/2728816652/bella.lee' },
  )
  const rows = [...dom.window.document.querySelectorAll('.b-comments__item')]
  attachVueProps(rows[0]!, { comment: { id: 324902863 } })
  attachVueProps(rows[1]!, { comment: { id: 324875474 } })
  return dom
}

function onlyFansDmDom(): JSDOM {
  const dom = new JSDOM(
    `<!doctype html>
      <div class="b-chat__messages">
        <div class="b-chat__message__system m-timeline">Timeline row</div>
        <div class="b-chat__message m-text">
          <div class="b-chat__message__text-holder">DM fixture text</div>
        </div>
      </div>`,
    { url: 'https://onlyfans.com/my/chats/chat/564580593/' },
  )
  const row = dom.window.document.querySelector('.b-chat__message')!
  attachVueProps(row, { message: { id: 11105260858545 } })
  return dom
}

function attachReactMessageId(row: Element, id: string): void {
  Object.defineProperty(row, '__reactFiber$test', {
    value: {
      memoizedProps: {},
      return: {
        memoizedProps: {
          message: { id },
        },
      },
    },
  })
}

function attachVueProps(row: Element, props: Record<string, unknown>): void {
  Object.defineProperty(row, '__vue__', {
    configurable: true,
    value: {
      _props: props,
      $options: { propsData: props },
    },
  })
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

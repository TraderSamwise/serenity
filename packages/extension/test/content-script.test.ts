import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import type { ClassifyMessagesRequest, ClassifyMessagesResponse } from '@serenity/core'
import {
  SerenityContentScript,
  activeSelectorDefinition,
  activeSelectorDefinitions,
  collectRows,
  defaultHideCss,
  installSerenityContentScripts,
  shouldRefilterForStorageChanges,
} from '../src/content-script'
import { hashMessageText } from '../src/hash'
import {
  ONLYFANS_COMMENT_SELECTORS,
  ONLYFANS_DM_LIST_SELECTORS,
  ONLYFANS_DM_SELECTORS,
  TWITCH_CHAT_SELECTORS,
  X_OWN_POST_COMMENT_SELECTORS,
  YOUTUBE_COMMENT_SELECTORS,
  YOUTUBE_LIVE_CHAT_SELECTORS,
} from '../src/selectors'
import type { RuntimeMessenger } from '../src/content-script'
import type { ServiceSelectorDefinition } from '../src/selectors'

const contentScriptPath = fileURLToPath(new URL('../src/content-script.ts', import.meta.url))

describe('content script DOM suppression', () => {
  it('injects CSS that default-hides matching rows before worker verdicts exist', async () => {
    const dom = xStatusDom()
    const runtime = recordingRuntime(async () => new Promise<ClassifyMessagesResponse>(() => {}))
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const reply = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement

    script.start()

    expect(dom.window.document.querySelector('style[id^="serenity-default-hide-x_own_post_comments"]')).not.toBeNull()
    expect(reply.matches('article[data-testid="tweet"]:not([data-serenity-hidden="shown"])')).toBe(true)
    expect(reply.style.display).toBe('')
    expect(reply.dataset.serenityHidden).toBe('pending')
    script.stop()
  })

  it('falls back to row textContent and hash-keyed verdicts when no text selector is declared', async () => {
    const dom = xStatusDom()
    const hash = await hashMessageText('Constructive but blunt reply')
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide: false, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const reply = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement

    expect(activeSelectorDefinition(dom.window.location.href)).toBe(X_OWN_POST_COMMENT_SELECTORS)
    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    expect(runtime.calls[0]).toEqual({
      type: 'serenity.classifyMessages',
      serviceId: 'x_own_post_comments',
      messages: [{ hash, text: 'Constructive but blunt reply' }],
    })
    expect(reply.dataset.serenityHidden).toBe('shown')
  })

  it('uses optional text selectors for cache-stable message text', async () => {
    const dom = youtubeCommentsDom()
    const hash = await hashMessageText('Parent comment text')
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide: false, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    await script.scan()

    expect((runtime.calls[0] as ClassifyMessagesRequest).messages[0]).toEqual({
      hash,
      text: 'Parent comment text',
    })
  })

  it('does not fall back to row chrome when a declared text selector is missing', async () => {
    const dom = new JSDOM(
      `<!doctype html>
        <ytd-comments id="comments">
          <ytd-comment-thread-renderer>
            <div id="comment-container">
              <ytd-comment-view-model id="comment">Display name 1 day ago Reply</ytd-comment-view-model>
            </div>
          </ytd-comment-thread-renderer>
        </ytd-comments>`,
      { url: 'https://www.youtube.com/watch?v=abc123' },
    )
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const row = dom.window.document.querySelector('ytd-comment-view-model#comment') as HTMLElement

    await script.scan()

    expect(runtime.calls).toHaveLength(0)
    expect(row.dataset.serenityHidden).toBeUndefined()
  })

  it('classifies default-hidden rows when a declared text selector mounts later', async () => {
    const dom = new JSDOM(
      `<!doctype html>
        <ytd-comments id="comments">
          <ytd-comment-thread-renderer>
            <div id="comment-container">
              <ytd-comment-view-model id="comment">
                <div id="header">Display name 1 day ago</div>
                <div id="content"></div>
                <div id="toolbar">Reply</div>
              </ytd-comment-view-model>
            </div>
          </ytd-comment-thread-renderer>
        </ytd-comments>`,
      { url: 'https://www.youtube.com/watch?v=abc123' },
    )
    const hash = await hashMessageText('Late comment text')
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide: false, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const row = dom.window.document.querySelector('ytd-comment-view-model#comment') as HTMLElement
    const content = dom.window.document.querySelector('#content')!

    script.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.calls).toHaveLength(0)
    expect(row.dataset.serenityHidden).toBeUndefined()

    const text = dom.window.document.createElement('span')
    text.className = 'ytAttributedStringHost'
    text.textContent = 'Late comment text'
    content.append(text)

    await waitFor(() => runtime.calls.length === 1)
    expect((runtime.calls[0] as ClassifyMessagesRequest).messages[0]).toEqual({
      hash,
      text: 'Late comment text',
    })
    expect(row.dataset.serenityHidden).toBe('shown')
    script.stop()
  })

  it('uses scroll as a generic scan trigger for lazy rows missed by mutation observation', async () => {
    const dom = new JSDOM(
      `<!doctype html><ytd-comments id="comments"></ytd-comments>`,
      { url: 'https://www.youtube.com/watch?v=abc123' },
    )
    const hash = await hashMessageText('Scroll-mounted comment')
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide: false, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      NoopMutationObserver as unknown as typeof MutationObserver,
    )
    const comments = dom.window.document.querySelector('ytd-comments#comments')!

    script.start()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(runtime.calls).toHaveLength(0)

    comments.insertAdjacentHTML(
      'beforeend',
      `<ytd-comment-thread-renderer>
        <div id="comment-container">
          <ytd-comment-view-model id="comment">
            <span class="ytAttributedStringHost">Scroll-mounted comment</span>
          </ytd-comment-view-model>
        </div>
      </ytd-comment-thread-renderer>`,
    )
    dom.window.dispatchEvent(new dom.window.Event('scroll'))

    await waitFor(() => runtime.calls.length === 1)
    const row = dom.window.document.querySelector('ytd-comment-view-model#comment') as HTMLElement
    expect(row.dataset.serenityHidden).toBe('shown')
    script.stop()
  })

  it('refilters by rescanning present DOM rows with no stored row identity', async () => {
    const dom = xStatusDom()
    const hash = await hashMessageText('Constructive but blunt reply')
    let hide = false
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide, status: 'classified' }],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      X_OWN_POST_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const reply = dom.window.document.querySelectorAll('article[data-testid="tweet"]')[1] as HTMLElement

    await script.scan()
    expect(reply.dataset.serenityHidden).toBe('shown')

    hide = true
    await script.refilter()

    expect(runtime.calls).toHaveLength(2)
    expect(reply.dataset.serenityHidden).toBe('verdict')
    expect(reply.matches('article[data-testid="tweet"]:not([data-serenity-hidden="shown"])')).toBe(true)
  })

  it('retries hidden rows when the worker fails or returns unclassified', async () => {
    const dom = xStatusDom()
    const hash = await hashMessageText('Constructive but blunt reply')
    let attempts = 0
    const runtime = recordingRuntime(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('worker unavailable')
      if (attempts === 2) {
        return {
          type: 'serenity.classifyMessagesResult',
          verdicts: [{ hash, hide: true, status: 'unclassified', reason: 'quota_exhausted' }],
        } satisfies ClassifyMessagesResponse
      }
      return {
        type: 'serenity.classifyMessagesResult',
        verdicts: [{ hash, hide: false, status: 'classified' }],
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
    await waitFor(() => runtime.calls.length === 2)
    await waitFor(() => runtime.calls.length === 3)

    expect(reply.dataset.serenityHidden).toBe('shown')
    script.stop()
  })

  it('does not classify the same row twice while the first verdict is in flight', async () => {
    const dom = xStatusDom()
    const hash = await hashMessageText('Constructive but blunt reply')
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

    const firstScan = script.scan()
    await waitFor(() => runtime.calls.length === 1)
    await script.scan()

    expect(runtime.calls).toHaveLength(1)
    resolveResponse({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide: false, status: 'classified' }],
    })
    await firstScan
  })

  it('leaves rows removed while classification is in flight untouched and has no pruning state', async () => {
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

    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain(['prune', 'KnownRows'].join(''))
    expect(source).not.toContain(['stable', 'IdToHash'].join(''))

    const hash = (runtime.calls[0] as ClassifyMessagesRequest).messages[0]!.hash
    resolveResponse({
      type: 'serenity.classifyMessagesResult',
      verdicts: [{ hash, hide: false, status: 'classified' }],
    })
    await scan

    expect(scroller.querySelectorAll('[data-a-target="chat-line-message"]')).toHaveLength(0)
  })

  it('keeps classifying rows after a streaming container is replaced', async () => {
    const dom = twitchChatDom()
    const runtime = recordingRuntime(async (message) => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: (message as ClassifyMessagesRequest).messages.map((item) => ({
        hash: item.hash,
        hide: false,
        status: 'classified',
      })),
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      TWITCH_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )
    const firstScroller = dom.window.document.querySelector('[data-a-target="chat-scroller"]')!
    script.start()
    await waitFor(() => runtime.calls.length === 1)

    const nextScroller = dom.window.document.createElement('div')
    nextScroller.dataset.aTarget = 'chat-scroller'
    const nextRow = dom.window.document.createElement('div')
    nextRow.dataset.aTarget = 'chat-line-message'
    const nextBody = dom.window.document.createElement('span')
    nextBody.dataset.aTarget = 'chat-line-message-body'
    nextBody.textContent = 'Replacement chat line'
    nextRow.append(nextBody)
    nextScroller.append(nextRow)
    firstScroller.replaceWith(nextScroller)

    await waitFor(() => runtime.calls.length === 2)

    expect(nextRow.dataset.serenityHidden).toBe('shown')
    script.stop()
  })

  it('refilters only when policy settings change, not hidden-count bookkeeping', () => {
    expect(
      shouldRefilterForStorageChanges({
        hiddenCounts: { oldValue: { byVerdict: 0 }, newValue: { byVerdict: 1 } },
      }),
    ).toBe(false)
    expect(
      shouldRefilterForStorageChanges({
        defaultPreset: { oldValue: 'aggressive', newValue: 'balanced' },
      }),
    ).toBe(true)
    expect(
      shouldRefilterForStorageChanges({
        servicePresetOverrides: { oldValue: {}, newValue: { youtube_comments: 'off' } },
      }),
    ).toBe(true)
  })

  it('does not run a forever polling interval on supported pages', async () => {
    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain('setInterval')
  })
})

describe('selector-driven services', () => {
  it('classifies YouTube parent comments and expanded replies without service branches', async () => {
    const dom = youtubeCommentsDom()
    const rows = [...dom.window.document.querySelectorAll('ytd-comment-view-model#comment')] as HTMLElement[]
    const texts = ['Parent comment text', 'Expanded reply text']
    const hashes = await Promise.all(texts.map((text) => hashMessageText(text)))
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [
        { hash: hashes[0]!, hide: false, status: 'classified' },
        { hash: hashes[1]!, hide: true, status: 'classified' },
      ],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      YOUTUBE_COMMENT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    await script.scan()

    expect((runtime.calls[0] as ClassifyMessagesRequest).messages.map((message) => message.text)).toEqual([
      'Parent comment text',
      'Expanded reply text',
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')
    expect(rows[1]!.dataset.serenityHidden).toBe('verdict')

    const source = await readFile(contentScriptPath, 'utf8')
    expect(source).not.toContain('youtube_comments')
    expect(source).not.toContain('YOUTUBE')
  })

  it('waits for late containers and installs both YouTube watch-page definitions', async () => {
    const dom = youtubeWatchDom()
    writeIframeDocument(
      dom,
      `<yt-live-chat-renderer>
        <div id="items">
          <yt-live-chat-text-message-renderer id="yt-live-1">Live chat row</yt-live-chat-text-message-renderer>
        </div>
      </yt-live-chat-renderer>`,
    )
    const runtime = recordingRuntime(async (message) => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: (message as ClassifyMessagesRequest).messages.map((item) => ({
        hash: item.hash,
        hide: false,
        status: 'classified',
      })),
    }))

    const scripts = installSerenityContentScripts(
      dom.window.document,
      runtime,
      dom.window.MutationObserver,
    )
    await waitFor(() => runtime.calls.length === 2)

    expect(activeSelectorDefinitions(dom.window.location.href)).toEqual([
      YOUTUBE_COMMENT_SELECTORS,
      YOUTUBE_LIVE_CHAT_SELECTORS,
    ])
    expect(runtime.calls.map((message) => (message as ClassifyMessagesRequest).serviceId).sort()).toEqual([
      'youtube_comments',
      'youtube_live_chat',
    ])
    for (const script of scripts) script.stop()
  })

  it('keeps Twitch system rows out declaratively and sends only chat row text', async () => {
    const dom = twitchChatDom()
    const rows = [...dom.window.document.querySelectorAll('[data-a-target="chat-line-message"]')] as HTMLElement[]
    const hashes = await Promise.all(['First chat line', 'WaveEmoteName'].map((text) => hashMessageText(text)))
    const runtime = recordingRuntime(async () => ({
      type: 'serenity.classifyMessagesResult',
      verdicts: [
        { hash: hashes[0]!, hide: false, status: 'classified' },
        { hash: hashes[1]!, hide: true, status: 'classified' },
      ],
    }))
    const script = new SerenityContentScript(
      dom.window.document,
      TWITCH_CHAT_SELECTORS,
      runtime,
      dom.window.MutationObserver,
    )

    await script.scan()

    expect(dom.window.document.querySelectorAll('[data-a-target="chat-welcome-message"]')).toHaveLength(1)
    expect((runtime.calls[0] as ClassifyMessagesRequest).messages.map((message) => message.text)).toEqual([
      'First chat line',
      'WaveEmoteName',
    ])
    expect(rows[0]!.dataset.serenityHidden).toBe('shown')
    expect(rows[1]!.dataset.serenityHidden).toBe('verdict')
  })

  it('runs OnlyFans list, thread, and comment selectors using the NSFW service ids', async () => {
    const listDom = onlyFansDmListDom()
    const threadDom = onlyFansDmDom()
    const commentDom = onlyFansCommentDom()

    expect(activeSelectorDefinitions('https://onlyfans.com/my/chats/')).toEqual([
      ONLYFANS_DM_LIST_SELECTORS,
      ONLYFANS_DM_SELECTORS,
    ])
    expect(activeSelectorDefinitions('https://onlyfans.com/my/chats/chat/564580593/')).toEqual([
      ONLYFANS_DM_LIST_SELECTORS,
      ONLYFANS_DM_SELECTORS,
    ])
    expect(activeSelectorDefinition(commentDom.window.location.href)).toBe(ONLYFANS_COMMENT_SELECTORS)

    await expectServiceScan(listDom, ONLYFANS_DM_LIST_SELECTORS, 'onlyfans_dms', [
      'First preview fixture',
      'Second preview fixture',
    ])
    await expectServiceScan(threadDom, ONLYFANS_DM_SELECTORS, 'onlyfans_dms', ['DM fixture text'])
    await expectServiceScan(commentDom, ONLYFANS_COMMENT_SELECTORS, 'onlyfans_comments', [
      'First comment fixture',
      'Second comment fixture',
    ])
  })

  it('injects one stylesheet per matching OnlyFans definition even when service ids match', () => {
    const dom = onlyFansChatRouteDom()
    const runtime = recordingRuntime(async () => ({ type: 'serenity.classifyMessagesResult', verdicts: [] }))

    const scripts = installSerenityContentScripts(
      dom.window.document,
      runtime,
      dom.window.MutationObserver,
    )

    expect(scripts).toHaveLength(2)
    expect(dom.window.document.querySelectorAll('style[id^="serenity-default-hide-onlyfans_dms"]')).toHaveLength(2)
    for (const script of scripts) script.stop()
  })

  it('keeps selector data compact: no identity or surface labels', () => {
    expect(defaultHideCss(YOUTUBE_COMMENT_SELECTORS)).toContain(
      'ytd-comment-replies-renderer #expanded-threads ytd-comment-view-model#comment:not([data-serenity-hidden="shown"])',
    )
    expect(JSON.stringify([
      X_OWN_POST_COMMENT_SELECTORS,
      YOUTUBE_COMMENT_SELECTORS,
      YOUTUBE_LIVE_CHAT_SELECTORS,
      TWITCH_CHAT_SELECTORS,
      ONLYFANS_DM_LIST_SELECTORS,
      ONLYFANS_DM_SELECTORS,
      ONLYFANS_COMMENT_SELECTORS,
    ])).not.toMatch(new RegExp(`stable${'Id'}|surface${'Type'}|react-${'prop'}|vue-${'prop'}`))
  })
})

async function expectServiceScan(
  dom: JSDOM,
  definition: ServiceSelectorDefinition,
  serviceId: string,
  texts: readonly string[],
): Promise<void> {
  const hashes = await Promise.all(texts.map((text) => hashMessageText(text)))
  const runtime = recordingRuntime(async () => ({
    type: 'serenity.classifyMessagesResult',
    verdicts: hashes.map((hash, index) => ({
      hash,
      hide: index === 0,
      status: 'classified',
    })),
  }))
  const script = new SerenityContentScript(
    dom.window.document,
    definition,
    runtime,
    dom.window.MutationObserver,
  )

  await script.scan()

  expect((runtime.calls[0] as ClassifyMessagesRequest).serviceId).toBe(serviceId)
  expect((runtime.calls[0] as ClassifyMessagesRequest).messages.map((message) => message.text)).toEqual(texts)
}

function xStatusDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <main>
        <div data-testid="primaryColumn">
          <article data-testid="tweet"><div data-testid="tweetText">Creator post</div></article>
          <article data-testid="tweet"><div data-testid="tweetText">Constructive but blunt reply</div></article>
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
          <ytd-comment-thread-renderer>
            <div id="comment-container">
              <ytd-comment-view-model id="comment">
                <div id="header">Display name 2 days ago</div>
                <div id="content">
                  <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">Parent comment text</span>
                </div>
                <div id="toolbar">Reply 14 likes</div>
              </ytd-comment-view-model>
            </div>
            <ytd-comment-replies-renderer>
              <div id="expanded-threads">
                <ytd-comment-view-model id="comment">
                  <div id="header">Display name 1 day ago</div>
                  <div id="content">
                    <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">Expanded reply text</span>
                  </div>
                  <div id="toolbar">Reply 2 likes</div>
                </ytd-comment-view-model>
              </div>
            </ytd-comment-replies-renderer>
          </ytd-comment-thread-renderer>
        </ytd-comments>
      </ytd-watch-flexy>`,
    { url: 'https://www.youtube.com/watch?v=abc123' },
  )
}

function youtubeWatchDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <ytd-watch-flexy>
        <ytd-comments id="comments">
          <ytd-comment-thread-renderer>
            <div id="comment-container">
              <ytd-comment-view-model id="comment">
                <div id="content">
                  <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap">Parent comment text</span>
                </div>
              </ytd-comment-view-model>
            </div>
          </ytd-comment-thread-renderer>
        </ytd-comments>
        <ytd-live-chat-frame><iframe id="chatframe"></iframe></ytd-live-chat-frame>
      </ytd-watch-flexy>`,
    { resources: 'usable', url: 'https://www.youtube.com/watch?v=abc123' },
  )
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
  return new JSDOM(
    `<!doctype html>
      <main>
        <div data-a-target="chat-scroller" role="log">
          <div data-a-target="chat-welcome-message">Welcome row</div>
          <div data-a-target="chat-line-message">
            <span data-a-target="chat-message-username">UserOne</span>
            <span data-a-target="chat-line-message-body">First chat line</span>
          </div>
          <div data-a-target="chat-line-message">
            <span data-a-target="chat-message-username">UserTwo</span>
            <span data-a-target="chat-line-message-body"><span>Wave</span><span>EmoteName</span></span>
          </div>
        </div>
      </main>`,
    { url: 'https://www.twitch.tv/live_channel' },
  )
}

function onlyFansDmListDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <div class="b-chats__list-dialogues">
        <div class="b-chats__item">
          <span class="g-user-name">Display name</span>
          <div class="b-chats__item__last-message__content">First preview fixture</div>
          <div class="b-chats__item__time">1h</div>
        </div>
        <div class="b-chats__item">
          <span class="g-user-name">Display name</span>
          <div class="b-chats__item__last-message__content">Second preview fixture</div>
          <div class="b-chats__item__time">2h</div>
        </div>
      </div>`,
    { url: 'https://onlyfans.com/my/chats/' },
  )
}

function onlyFansChatRouteDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <div class="b-chats__list-dialogues"><div class="b-chats__item">Preview fixture</div></div>
      <div class="b-chat__messages"><div class="b-chat__message">DM fixture text</div></div>`,
    { url: 'https://onlyfans.com/my/chats/chat/564580593/' },
  )
}

function onlyFansDmDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <div class="b-chat__messages">
        <div class="b-chat__message__system m-timeline">Timeline row</div>
        <div class="b-chat__message m-text">
          <span class="b-chat__message__time">12:00</span>
          <div class="b-chat__message__text">DM fixture text</div>
          <button>Reply</button>
        </div>
      </div>`,
    { url: 'https://onlyfans.com/my/chats/chat/564580593/' },
  )
}

function onlyFansCommentDom(): JSDOM {
  return new JSDOM(
    `<!doctype html>
      <div class="b-comments__list">
        <div class="b-comments__item m-break-word g-position-relative">
          <a class="b-username">Display name</a>
          <div class="b-comments__item-text">First comment fixture</div>
          <div class="b-comments__item__actions">Reply 1h</div>
        </div>
        <div class="b-comments__item m-break-word g-position-relative">
          <a class="b-username">Display name</a>
          <div class="b-comments__item-text">Second comment fixture</div>
          <div class="b-comments__item__actions">Reply 2h</div>
        </div>
      </div>`,
    { url: 'https://onlyfans.com/2728816652/bella.lee' },
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

class NoopMutationObserver {
  constructor(_callback: MutationCallback) {}

  observe(): void {}

  disconnect(): void {}

  takeRecords(): MutationRecord[] {
    return []
  }
}

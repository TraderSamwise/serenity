import { describe, expect, it } from 'vitest'
import { ChromeSettingsStore } from '../src/settings'

describe('ChromeSettingsStore', () => {
  it('reads optional proxy identity fields from chrome storage', async () => {
    const storage = {
      async get(keys: null) {
        expect(keys).toBeNull()
        return {
          proxyToken: 'signed-token',
          installId: 'install-id',
        }
      },
      async set() {},
      QUOTA_BYTES: 10485760,
    } as unknown as chrome.storage.LocalStorageArea

    await expect(new ChromeSettingsStore(storage).get()).resolves.toMatchObject({
      proxyUrl: 'http://localhost:8787',
      proxyToken: 'signed-token',
      installId: 'install-id',
      hiddenCounts: { byVerdict: 0, awaitingVerdict: 0 },
    })
  })
})

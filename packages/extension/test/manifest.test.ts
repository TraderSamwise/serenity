import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const manifestPath = fileURLToPath(new URL('../manifest.json', import.meta.url))

describe('MV3 manifest', () => {
  it('uses minimum permissions and only declared service hosts', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      manifest_version: number
      permissions: string[]
      host_permissions: string[]
      background: { service_worker: string; type: string }
      content_scripts: Array<{ matches: string[]; js: string[]; run_at: string }>
    }

    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toEqual(['storage'])
    expect(manifest.permissions).not.toContain('tabs')
    expect(manifest.permissions).not.toContain('scripting')
    expect(manifest.host_permissions).toEqual([
      'https://x.com/*',
      'https://www.youtube.com/*',
      'https://www.instagram.com/*',
      'https://www.twitch.tv/*',
      'https://onlyfans.com/*',
      'https://fansly.com/*',
    ])
    expect(manifest.host_permissions).not.toContain('<all_urls>')
    expect(manifest.background).toEqual({
      service_worker: 'dist/background.js',
      type: 'module',
    })
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://x.com/*', 'https://www.youtube.com/watch*', 'https://www.twitch.tv/*'],
        js: ['dist/content-script.js'],
        run_at: 'document_start',
      },
    ])
  })
})

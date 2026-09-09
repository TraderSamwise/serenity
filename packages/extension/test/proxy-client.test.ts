import { describe, expect, it } from 'vitest'
import { HttpProxyClient } from '../src/proxy-client'
import { classification } from './helpers'

describe('proxy client', () => {
  it('registers an install UUID without an authorization header', async () => {
    const calls: Array<{ url: string; body: unknown; authorization: string | null }> = []
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        authorization: headers.get('authorization'),
      })
      return new Response(JSON.stringify({ token: 'signed-token' }))
    }

    await expect(
      new HttpProxyClient(fetchImpl).registerInstall(
        '123e4567-e89b-12d3-a456-426614174000',
        'https://proxy.example/base',
      ),
    ).resolves.toEqual({ token: 'signed-token' })

    expect(calls).toEqual([
      {
        url: 'https://proxy.example/register',
        body: { installId: '123e4567-e89b-12d3-a456-426614174000' },
        authorization: null,
      },
    ])
  })

  it('sends only message text batches and the install token', async () => {
    const calls: Array<{ url: string; body: unknown; authorization: string | null }> = []
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        authorization: headers.get('authorization'),
      })
      return new Response(JSON.stringify({ results: [{ status: 'classified', classification: classification() }] }))
    }

    await new HttpProxyClient(fetchImpl).classify(
      ['Synthetic message'],
      'signed-install-token',
      'https://proxy.example/base',
    )

    expect(calls).toEqual([
      {
        url: 'https://proxy.example/classify',
        body: { messages: ['Synthetic message'] },
        authorization: 'Bearer signed-install-token',
      },
    ])
  })

  it('calls fetch without rebinding native receiver context', async () => {
    let receiver: unknown = null
    const fetchImpl = async function (this: unknown) {
      receiver = this
      return new Response(JSON.stringify({ results: [{ status: 'classified', classification: classification() }] }))
    } as typeof fetch

    await new HttpProxyClient(fetchImpl).classify(
      ['Synthetic message'],
      'signed-install-token',
      'https://proxy.example/base',
    )

    expect(receiver).toBeUndefined()
  })
})

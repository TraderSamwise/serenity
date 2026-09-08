import { describe, expect, it } from 'vitest'
import { HttpProxyClient } from '../src/proxy-client'
import { classification } from './helpers'

describe('proxy client', () => {
  it('sends only message text batches and the install token', async () => {
    const calls: Array<{ url: string; body: unknown; authorization: string | null }> = []
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        authorization: headers.get('authorization'),
      })
      return new Response(JSON.stringify({ classifications: [classification()] }))
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
})

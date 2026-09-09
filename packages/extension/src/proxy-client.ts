import type { ProxyClassifyResponse, ProxyRegisterResponse } from '@serenity/core'

export interface ProxyClient {
  registerInstall(
    installId: string,
    proxyUrl: string,
  ): Promise<ProxyRegisterResponse>
  classify(
    messages: readonly string[],
    token: string,
    proxyUrl: string,
  ): Promise<ProxyClassifyResponse>
}

export class HttpProxyClient implements ProxyClient {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis) as typeof fetch) {}

  async registerInstall(
    installId: string,
    proxyUrl: string,
  ): Promise<ProxyRegisterResponse> {
    const fetchImpl = this.fetchImpl
    const response = await fetchImpl(new URL('/register', proxyUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ installId }),
    })

    if (!response.ok) throw new Error(`Proxy register failed with HTTP ${response.status}.`)
    return (await response.json()) as ProxyRegisterResponse
  }

  async classify(
    messages: readonly string[],
    token: string,
    proxyUrl: string,
  ): Promise<ProxyClassifyResponse> {
    const fetchImpl = this.fetchImpl
    const response = await fetchImpl(new URL('/classify', proxyUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    })

    if (!response.ok) throw new Error(`Proxy classify failed with HTTP ${response.status}.`)
    return (await response.json()) as ProxyClassifyResponse
  }
}

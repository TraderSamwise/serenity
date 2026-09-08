import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { createDefaultProxyApp, loadProxyConfig } from './config'

async function main(): Promise<void> {
  let config
  try {
    config = loadProxyConfig()
  } catch (error) {
    console.error((error as Error).message)
    process.exitCode = 1
    return
  }

  const app = createDefaultProxyApp(config)
  const server = createServer(async (request, response) => {
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(name, item)
      } else if (value !== undefined) {
        headers.set(name, value)
      }
    }
    const webRequest = new Request(
      `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`,
      {
        method: request.method,
        headers,
        body: body === undefined ? undefined : Readable.toWeb(body),
        duplex: body === undefined ? undefined : 'half',
      } as RequestInit,
    )
    const webResponse = await app.fetch(webRequest)
    response.writeHead(
      webResponse.status,
      Object.fromEntries(webResponse.headers.entries()),
    )
    if (webResponse.body === null) {
      response.end()
      return
    }
    response.end(Buffer.from(await webResponse.arrayBuffer()))
  })

  server.listen(config.port, () => {
    console.log(`serenity proxy listening on ${config.port}`)
  })
}

await main()

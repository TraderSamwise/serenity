import { classifyBatch } from './classify'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ClassifyDependencies } from './classify'
import type { ClassifyBatchStats } from './classify'
import { verifyInstallToken } from './token'

export interface ProxyApp {
  fetch(request: Request): Promise<Response>
}

export interface ProxyAppOptions {
  tokenSecret: string
  deps: ClassifyDependencies
  statsPath?: string
}

type ClassifyRequestBody = {
  messages: string[]
}

export function createProxyApp(options: ProxyAppOptions): ProxyApp {
  return {
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname !== '/classify') return json({ error: 'Not found.' }, 404)
      if (request.method === 'OPTIONS') return empty(204)
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

      const installId = authenticate(request, options.tokenSecret)
      if (installId === null) return json({ error: 'Invalid install token.' }, 401)

      const body = await readClassifyBody(request)
      if (body instanceof Response) return body

      try {
        const result = await classifyBatch(body.messages, installId, options.deps)
        await logClassifyStats(result.stats, options.statsPath)
        return json({ classifications: result.classifications }, 200)
      } catch {
        return json({ error: 'Classification failed.' }, 502)
      }
    },
  }
}

function authenticate(request: Request, secret: string): string | null {
  const authorization = request.headers.get('authorization')
  if (authorization === null || !authorization.startsWith('Bearer ')) return null
  return verifyInstallToken(authorization.slice('Bearer '.length), secret)
}

async function readClassifyBody(request: Request): Promise<ClassifyRequestBody | Response> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400)
  }

  if (!isRecord(parsed)) return json({ error: 'Request body must be an object.' }, 400)
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'messages') {
    return json({ error: 'Unsupported request field.' }, 400)
  }
  if (!Array.isArray(parsed.messages)) {
    return json({ error: 'messages must be an array.' }, 400)
  }
  if (parsed.messages.length === 0) {
    return json({ error: 'messages must not be empty.' }, 400)
  }
  if (!parsed.messages.every((message) => typeof message === 'string')) {
    return json({ error: 'Each message must be a string.' }, 400)
  }

  return { messages: parsed.messages }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json' }),
  })
}

async function logClassifyStats(
  stats: ClassifyBatchStats,
  statsPath: string | undefined,
): Promise<void> {
  console.log(`serenity proxy classify stats ${JSON.stringify(stats)}`)
  if (statsPath === undefined) return

  await mkdir(dirname(statsPath), { recursive: true })
  await appendFile(statsPath, `${JSON.stringify(stats)}\n`, 'utf8')
}

function empty(status: number): Response {
  return new Response(null, {
    status,
    headers: corsHeaders(),
  })
}

function corsHeaders(headers: Record<string, string> = {}): HeadersInit {
  return {
    ...headers,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
}

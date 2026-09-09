import { classifyBatch } from './classify'
import type { ClassifyDependencies } from './classify'
import type { RegisterLimiter } from './register-limit'
import { issueInstallToken, isValidInstallId, verifyInstallToken } from './token'

export interface ProxyApp {
  fetch(request: Request): Promise<Response>
}

export interface ProxyAppOptions {
  tokenSecret: string
  deps: ClassifyDependencies
  registerLimiter: RegisterLimiter
}

type ClassifyRequestBody = {
  messages: string[]
}

type RegisterRequestBody = {
  installId: string
}

export function createProxyApp(options: ProxyAppOptions): ProxyApp {
  return {
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method === 'OPTIONS') return empty(204)
      if (url.pathname === '/register') return handleRegister(request, options)
      if (url.pathname !== '/classify') return json({ error: 'Not found.' }, 404)
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

      const installId = authenticate(request, options.tokenSecret)
      if (installId === null) return json({ error: 'Invalid install token.' }, 401)

      const body = await readClassifyBody(request)
      if (body instanceof Response) return body

      try {
        const result = await classifyBatch(body.messages, installId, options.deps)
        console.log(`serenity proxy classify stats ${JSON.stringify(result.stats)}`)
        return json({ results: result.results }, 200)
      } catch {
        return json({ error: 'Classification failed.' }, 502)
      }
    },
  }
}

async function handleRegister(request: Request, options: ProxyAppOptions): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!(await options.registerLimiter.allow(request))) {
    return json({ error: 'Registration rate limit exceeded.' }, 429)
  }

  const body = await readRegisterBody(request)
  if (body instanceof Response) return body

  return json({ token: issueInstallToken(body.installId, { secret: options.tokenSecret }) }, 200)
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

async function readRegisterBody(request: Request): Promise<RegisterRequestBody | Response> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400)
  }

  if (!isRecord(parsed)) return json({ error: 'Request body must be an object.' }, 400)
  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'installId') {
    return json({ error: 'Unsupported request field.' }, 400)
  }
  if (typeof parsed.installId !== 'string' || !isValidInstallId(parsed.installId)) {
    return json({ error: 'installId must be a UUID.' }, 400)
  }

  return { installId: parsed.installId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json' }),
  })
}

export function empty(status: number): Response {
  return new Response(null, {
    status,
    headers: corsHeaders(),
  })
}

export function corsHeaders(headers: Record<string, string> = {}): HeadersInit {
  return {
    ...headers,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
}

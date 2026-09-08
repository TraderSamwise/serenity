import { createDefaultProxyApp, loadProxyConfig } from './config'
import type { ProxyEnv } from './config'
import type { ProxyApp } from './http'
import { json } from './http'

export interface ProxyWorkerEnv extends ProxyEnv {
  SERENITY_OPENAI_API_KEY?: string
  SERENITY_PROXY_TOKEN_SECRET?: string
  SERENITY_UPSTASH_REDIS_REST_URL?: string
  SERENITY_UPSTASH_REDIS_REST_TOKEN?: string
}

type ProxyAppFactory = (env: ProxyWorkerEnv) => ProxyApp

export function createWorkerFetchHandler(factory: ProxyAppFactory = defaultAppFactory) {
  return {
    async fetch(request: Request, env: ProxyWorkerEnv): Promise<Response> {
      try {
        return await factory(env).fetch(request)
      } catch (error) {
        console.error((error as Error).message)
        return json({ error: (error as Error).message }, 500)
      }
    },
  }
}

function defaultAppFactory(env: ProxyWorkerEnv): ProxyApp {
  return createDefaultProxyApp(loadProxyConfig(env))
}

export default createWorkerFetchHandler()

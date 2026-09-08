import { normaliseMessageText } from '@serenity/core'

export async function hashMessageText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(normaliseMessageText(text))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

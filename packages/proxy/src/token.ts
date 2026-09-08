import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 'v1'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface InstallTokenPayload {
  version: typeof TOKEN_VERSION
  installId: string
  issuedAt: number
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function createInstallId(): string {
  return randomUUID()
}

export function issueInstallToken(
  installId: string,
  options: { secret: string; now?: number },
): string {
  if (!isValidUuid(installId)) throw new Error('Install ID must be a UUID.')
  const payload: InstallTokenPayload = {
    version: TOKEN_VERSION,
    installId,
    issuedAt: options.now ?? Date.now(),
  }
  const encodedPayload = base64url(JSON.stringify(payload))
  return `${encodedPayload}.${signPayload(encodedPayload, options.secret)}`
}

export function verifyInstallToken(token: string, secret: string): string | null {
  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra !== undefined) return null

  const expected = signPayload(encodedPayload, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as InstallTokenPayload
    if (payload.version !== TOKEN_VERSION || !isValidUuid(payload.installId)) return null
    return payload.installId
  } catch {
    return null
  }
}

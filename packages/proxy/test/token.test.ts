import { describe, expect, it } from 'vitest'
import { createInstallId, issueInstallToken, verifyInstallToken } from '../src/token'

describe('install tokens', () => {
  it('issues and verifies a signed token bound to an install UUID', () => {
    const installId = createInstallId()
    const token = issueInstallToken(installId, { secret: 'secret-a', now: 1 })

    expect(verifyInstallToken(token, 'secret-a')).toBe(installId)
    expect(verifyInstallToken(token, 'secret-b')).toBeNull()
  })

  it('rejects non-UUID install ids and tampered tokens', () => {
    expect(() =>
      issueInstallToken('not-an-install-uuid', { secret: 'secret-a' }),
    ).toThrow('Install ID must be a UUID.')

    const token = issueInstallToken(createInstallId(), { secret: 'secret-a', now: 1 })
    expect(verifyInstallToken(`${token}x`, 'secret-a')).toBeNull()
  })
})

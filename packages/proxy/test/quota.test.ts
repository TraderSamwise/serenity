import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@serenity/classifier'
import { MemoryQuotaStore } from '../src/quota'

describe('quota accounting', () => {
  it('keys usage by the hashed install id', async () => {
    const installId = '123e4567-e89b-12d3-a456-426614174000'
    const quota = new MemoryQuotaStore({
      perInstallTier2Quota: 10,
      globalTier2Ceiling: 10,
      globalTokenCeiling: 10000,
      tier2Enabled: true,
    })

    expect(await quota.reserveTier2(installId, 200)).toBe(true)
    await quota.recordTier2(installId, 123, 200)

    expect(quota.snapshot()).toMatchObject({
      installs: {
        [sha256Hex(installId)]: 1,
      },
      globalTier2Classifications: 1,
      globalTokens: 123,
    })
    expect(quota.snapshot().installs[installId]).toBeUndefined()
  })
})

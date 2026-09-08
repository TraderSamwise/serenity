import { describe, expect, it } from 'vitest'
import {
  NSFW_SERVICES,
  SERVICES,
  SFW_SERVICES,
  SITE_PROFILES,
  profileForService,
} from '../src/index'

describe('services', () => {
  it('maps sfw services to the standard profile', () => {
    expect(SFW_SERVICES).toEqual([
      'x_dms',
      'x_own_post_comments',
      'youtube_comments',
      'youtube_live_chat',
      'instagram_dms',
      'twitch_chat',
    ])

    for (const serviceId of SFW_SERVICES) {
      expect(SERVICES[serviceId]).toMatchObject({
        category: 'sfw',
        profile: 'standard',
        v1Action: 'dom_hide',
      })
      expect(profileForService(serviceId)).toBe(SITE_PROFILES.standard)
    }
  })

  it('maps nsfw services to the nsfw profile', () => {
    expect(NSFW_SERVICES).toEqual(['onlyfans_dms', 'onlyfans_comments', 'fansly_dms'])

    for (const serviceId of NSFW_SERVICES) {
      expect(SERVICES[serviceId]).toMatchObject({
        category: 'nsfw',
        profile: 'nsfw',
        v1Action: 'dom_hide',
      })
      expect(profileForService(serviceId)).toBe(SITE_PROFILES.nsfw)
    }
  })
})

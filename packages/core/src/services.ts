import { SITE_PROFILES } from './presets'
import type { SiteProfileName } from './presets'

export type ServiceId =
  | 'x_dms'
  | 'x_own_post_comments'
  | 'youtube_comments'
  | 'youtube_live_chat'
  | 'instagram_dms'
  | 'twitch_chat'
  | 'onlyfans_dms'
  | 'fansly_dms'

export type ServiceCategory = 'sfw' | 'nsfw'

export interface ServiceDefinition {
  id: ServiceId
  category: ServiceCategory
  label: string
  profile: SiteProfileName
  v1Action: 'dom_hide'
  futureActions: readonly ['auto_moderate', 'ban', 'block', 'hide']
}

const FUTURE_ACTIONS = ['auto_moderate', 'ban', 'block', 'hide'] as const

export const SFW_SERVICES = [
  'x_dms',
  'x_own_post_comments',
  'youtube_comments',
  'youtube_live_chat',
  'instagram_dms',
  'twitch_chat',
] as const satisfies readonly ServiceId[]

export const NSFW_SERVICES = [
  'onlyfans_dms',
  'fansly_dms',
] as const satisfies readonly ServiceId[]

export const SERVICES = {
  x_dms: {
    id: 'x_dms',
    category: 'sfw',
    label: 'X DMs',
    profile: 'standard',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  x_own_post_comments: {
    id: 'x_own_post_comments',
    category: 'sfw',
    label: 'X own post comments',
    profile: 'standard',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  youtube_comments: {
    id: 'youtube_comments',
    category: 'sfw',
    label: 'YouTube comments',
    profile: 'standard',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  youtube_live_chat: {
    id: 'youtube_live_chat',
    category: 'sfw',
    label: 'YouTube live chat',
    profile: 'standard',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  instagram_dms: {
    id: 'instagram_dms',
    category: 'sfw',
    label: 'Instagram DMs',
    profile: 'standard',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  twitch_chat: {
    id: 'twitch_chat',
    category: 'sfw',
    label: 'Twitch chat',
    profile: 'standard',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  onlyfans_dms: {
    id: 'onlyfans_dms',
    category: 'nsfw',
    label: 'OnlyFans DMs',
    profile: 'nsfw',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
  fansly_dms: {
    id: 'fansly_dms',
    category: 'nsfw',
    label: 'Fansly DMs',
    profile: 'nsfw',
    v1Action: 'dom_hide',
    futureActions: FUTURE_ACTIONS,
  },
} as const satisfies Record<ServiceId, ServiceDefinition>

export function profileForService(serviceId: ServiceId) {
  return SITE_PROFILES[SERVICES[serviceId].profile]
}

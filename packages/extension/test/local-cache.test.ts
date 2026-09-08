import { indexedDB } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  IndexedDbLocalVectorCache,
  LOCAL_CACHE_DB_NAME,
  LOCAL_CACHE_SCHEMA_VERSION,
} from '../src/local-cache'
import { classification } from './helpers'

describe('IndexedDB local vector cache', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(LOCAL_CACHE_DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('IndexedDB delete blocked.'))
    })
  })

  it('stores hash, vector, plaintext, service ids, and schema version locally', async () => {
    const cache = new IndexedDbLocalVectorCache(indexedDB)

    await cache.put({
      hash: 'hash-1',
      text: 'Local plaintext stays in this browser profile',
      serviceId: 'x_dms',
      classification: classification({ insult: 0.7 }),
    })
    await cache.put({
      hash: 'hash-1',
      text: 'Local plaintext stays in this browser profile',
      serviceId: 'twitch_chat',
      classification: classification({ insult: 0.7 }),
    })

    expect(await cache.get('hash-1')).toMatchObject({
      schemaVersion: LOCAL_CACHE_SCHEMA_VERSION,
      hash: 'hash-1',
      text: 'Local plaintext stays in this browser profile',
      classification: { scores: { insult: 0.7 } },
      serviceIds: ['x_dms', 'twitch_chat'],
    })
  })
})

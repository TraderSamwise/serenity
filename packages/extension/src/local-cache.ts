import type { Classification, ServiceId } from '@serenity/core'

export const LOCAL_CACHE_SCHEMA_VERSION = 1
export const LOCAL_CACHE_DB_NAME = 'serenity-local-cache'
export const LOCAL_CACHE_STORE = 'vectors'

export interface LocalCacheRecord {
  schemaVersion: number
  hash: string
  text: string
  classification: Classification
  serviceIds: readonly ServiceId[]
}

export interface LocalVectorCache {
  get(hash: string): Promise<LocalCacheRecord | undefined>
  put(record: {
    hash: string
    text: string
    serviceId: ServiceId
    classification: Classification
  }): Promise<void>
  all(): Promise<LocalCacheRecord[]>
}

export class MemoryLocalVectorCache implements LocalVectorCache {
  readonly records = new Map<string, LocalCacheRecord>()

  async get(hash: string): Promise<LocalCacheRecord | undefined> {
    return this.records.get(hash)
  }

  async put(record: {
    hash: string
    text: string
    serviceId: ServiceId
    classification: Classification
  }): Promise<void> {
    const existing = this.records.get(record.hash)
    this.records.set(record.hash, mergeRecord(existing, record))
  }

  async all(): Promise<LocalCacheRecord[]> {
    return [...this.records.values()]
  }
}

export class IndexedDbLocalVectorCache implements LocalVectorCache {
  constructor(private readonly indexedDb: IDBFactory = indexedDB) {}

  async get(hash: string): Promise<LocalCacheRecord | undefined> {
    const db = await this.open()
    try {
      const transaction = db.transaction(LOCAL_CACHE_STORE, 'readonly')
      return await requestResult<LocalCacheRecord | undefined>(
        transaction.objectStore(LOCAL_CACHE_STORE).get(hash),
      )
    } finally {
      db.close()
    }
  }

  async put(record: {
    hash: string
    text: string
    serviceId: ServiceId
    classification: Classification
  }): Promise<void> {
    const db = await this.open()
    try {
      const transaction = db.transaction(LOCAL_CACHE_STORE, 'readwrite')
      const store = transaction.objectStore(LOCAL_CACHE_STORE)
      const existing = await requestResult<LocalCacheRecord | undefined>(
        store.get(record.hash),
      )
      await requestResult(store.put(mergeRecord(existing, record)))
      await transactionDone(transaction)
    } finally {
      db.close()
    }
  }

  async all(): Promise<LocalCacheRecord[]> {
    const db = await this.open()
    try {
      const transaction = db.transaction(LOCAL_CACHE_STORE, 'readonly')
      return await requestResult<LocalCacheRecord[]>(
        transaction.objectStore(LOCAL_CACHE_STORE).getAll(),
      )
    } finally {
      db.close()
    }
  }

  private async open(): Promise<IDBDatabase> {
    const request = this.indexedDb.open(LOCAL_CACHE_DB_NAME, LOCAL_CACHE_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LOCAL_CACHE_STORE)) {
        db.createObjectStore(LOCAL_CACHE_STORE, { keyPath: 'hash' })
      }
    }
    return requestResult(request)
  }
}

function mergeRecord(
  existing: LocalCacheRecord | undefined,
  record: {
    hash: string
    text: string
    serviceId: ServiceId
    classification: Classification
  },
): LocalCacheRecord {
  return {
    schemaVersion: LOCAL_CACHE_SCHEMA_VERSION,
    hash: record.hash,
    text: record.text,
    classification: record.classification,
    serviceIds: mergeServiceIds(existing?.serviceIds ?? [], record.serviceId),
  }
}

function mergeServiceIds(serviceIds: readonly ServiceId[], serviceId: ServiceId) {
  return serviceIds.includes(serviceId) ? serviceIds : [...serviceIds, serviceId]
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

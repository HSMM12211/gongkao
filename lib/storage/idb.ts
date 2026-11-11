import { DB_NAME, DB_VERSION, STORES, type StoreName } from "@/lib/storage/schema"

function ensureIndexedDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment")
  }
}

function createStore(db: IDBDatabase, name: StoreName, keyPath: string) {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, { keyPath })
  }
}

function openDb(): Promise<IDBDatabase> {
  ensureIndexedDb()

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of Object.values(STORES)) {
        createStore(db, name, name === STORES.reviewStates ? "cardId" : "id")
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb()

  try {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const result = await run(store)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    return result
  } finally {
    db.close()
  }
}

export async function getItem<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore(storeName, "readonly", (store) => requestToPromise<T | undefined>(store.get(key)))
}

export async function putItem<T>(storeName: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  await withStore(storeName, "readwrite", async (store) => {
    const request = key === undefined ? store.put(value) : store.put(value, key)
    await requestToPromise(request)
  })
}

export async function deleteItem(storeName: StoreName, key: IDBValidKey): Promise<void> {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.delete(key))
  })
}

export async function listItems<T>(storeName: StoreName): Promise<T[]> {
  return withStore(storeName, "readonly", (store) => requestToPromise<T[]>(store.getAll()))
}

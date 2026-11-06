/**
 * Fase 2.4: Asynchronous IndexedDB Storage Engine for BMI Enterprise Workshop State
 * Overcomes the 5MB browser localStorage quota limit when storing Base64 inspection & tire photos,
 * and avoids blocking the main UI thread with synchronous storage writes.
 */

const IDB_DATABASE_NAME = 'bmi_enterprise_workshop_idb';
const IDB_DATABASE_VERSION = 1;
const IDB_STORE_NAME = 'workshop_state_store';

function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openWorkshopIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

export async function saveStateToIndexedDb<T>(key: string, value: T): Promise<boolean> {
  if (!isIndexedDbSupported()) return false;
  try {
    const db = await openWorkshopIdb();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return false;
  }
}

export async function loadStateFromIndexedDb<T>(key: string): Promise<T | null> {
  if (!isIndexedDbSupported()) return null;
  try {
    const db = await openWorkshopIdb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as T) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

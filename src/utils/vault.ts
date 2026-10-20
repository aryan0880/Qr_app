import { VaultItem } from '../types';

const DB_NAME = 'qrmesh_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'transmissions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToVault(
  payload: { type: 'image' | 'audio' | 'text'; data: string; title?: string }
): Promise<VaultItem> {
  const db = await openDB();

  const id = `beam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = Date.now();
  
  // Approximate size in bytes
  const sizeBytes = new Blob([payload.data]).size;

  let defaultTitle = 'Air-Gapped Transmission';
  if (payload.type === 'text') {
    defaultTitle = payload.data.slice(0, 30).replace(/[\r\n]+/g, ' ') || 'Secret Note';
  } else if (payload.type === 'audio') {
    defaultTitle = `Audio Recording (${(sizeBytes / 1024).toFixed(1)} KB)`;
  } else {
    defaultTitle = `Captured Photo (${(sizeBytes / 1024).toFixed(1)} KB)`;
  }

  const item: VaultItem = {
    id,
    type: payload.type,
    data: payload.data,
    timestamp,
    title: payload.title || defaultTitle,
    sizeBytes,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(item);

    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllVaultItems(): Promise<VaultItem[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    // Open cursor in reverse (newest first)
    const request = index.openCursor(null, 'prev');
    const items: VaultItem[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        resolve(items);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function deleteVaultItem(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function nukeVault(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

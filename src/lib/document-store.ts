const DB_NAME = "onbrand-originals";
const STORE_NAME = "files";

// In-memory cache for immediate zero-latency access and cross-component sharing
const memoryStore = new Map<string, Blob>();

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("This browser does not support local file storage."));
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local file storage."));
  });
}

/**
 * Cache a file or blob in memory immediately.
 */
export function cacheOriginalDocumentInMemory(key: string, file: Blob): void {
  memoryStore.set(key, file);
}

/**
 * Persist an uploaded original document in memory and IndexedDB.
 * Uses raw ArrayBuffer storage in IndexedDB to prevent browser file-handle detachment.
 */
export async function saveOriginalDocument(key: string, file: File | Blob): Promise<void> {
  // 1. Immediately cache in memory
  memoryStore.set(key, file);

  // 2. Persist in IndexedDB using cloneable ArrayBuffer
  try {
    const arrayBuffer = await file.arrayBuffer();
    const payload = {
      buffer: arrayBuffer,
      type: file.type,
      name: file instanceof File ? file.name : "document",
      size: file.size,
      savedAt: Date.now(),
    };

    const db = await openStore();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(payload, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not preserve the original file."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not preserve the original file."));
    }).finally(() => db.close());
  } catch (err) {
    // If IndexedDB fails (e.g. private browsing quota), in-memory cache still preserves file
    console.warn("IndexedDB persistence warning:", err);
  }
}

/**
 * Retrieve an original document by key.
 * Checks in-memory cache first, then IndexedDB, then server API fallback.
 */
export async function getOriginalDocument(key: string): Promise<File | Blob | undefined> {
  // 1. In-memory cache hit
  const cached = memoryStore.get(key);
  if (cached && cached.size > 0) {
    return cached;
  }

  // 2. Check IndexedDB
  try {
    const db = await openStore();
    type StoredPayload = { buffer?: ArrayBuffer; type?: string } | Blob;
    const result = await new Promise<StoredPayload | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not read the preserved file."));
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });

    if (result) {
      let blob: Blob;
      if (result instanceof Blob) {
        blob = result;
      } else if (result.buffer instanceof ArrayBuffer) {
        blob = new Blob([result.buffer], { type: result.type || "application/octet-stream" });
      } else {
        blob = new Blob([]);
      }
      memoryStore.set(key, blob);
      return blob;
    }
  } catch {
    // IndexedDB error or unavailable
  }

  // 3. Fallback to server API if key is present
  try {
    if (typeof window !== "undefined") {
      const res = await fetch(`/api/files?key=${encodeURIComponent(key)}`);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          memoryStore.set(key, blob);
          return blob;
        }
      }
    }
  } catch {
    // Server fetch unavailable or offline
  }

  return undefined;
}

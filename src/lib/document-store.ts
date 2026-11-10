const DB_NAME = "onbrand-originals";
const STORE_NAME = "files";

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser does not support local file storage."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local file storage."));
  });
}

export async function saveOriginalDocument(key: string, file: File): Promise<void> {
  const db = await openStore();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not preserve the original file."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not preserve the original file."));
  }).finally(() => db.close());
}

export async function getOriginalDocument(key: string): Promise<File | Blob | undefined> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as File | Blob | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read the preserved file."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

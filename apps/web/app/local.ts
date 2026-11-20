export type Saved = {
  id: string;
  name: string;
  blob: Blob;
  created: number;
  kind: "source" | "export";
};
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("karevia-media", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("files", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", mode);
    const result = run(tx.objectStore("files"));
    tx.oncomplete = () => {
      db.close();
      resolve(result.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const items = async () =>
  (await transaction<Saved[]>("readonly", (s) => s.getAll())).sort(
    (a, b) => b.created - a.created,
  );
export const save = (item: Saved) =>
  transaction("readwrite", (s) => s.put(item));
export const remove = (id: string) =>
  transaction("readwrite", (s) => s.delete(id));
export const erase = () => transaction("readwrite", (s) => s.clear());
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

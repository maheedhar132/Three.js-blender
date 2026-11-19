// Personal photo gallery persisted in IndexedDB (this browser only; no cloud sync).
const DB = 'igzp-virtual-zoo', STORE = 'photos';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('ts', 'ts'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };

export const Gallery = {
  add: photo => tx('readwrite', s => s.put(photo)),
  all: () => tx('readonly', s => s.getAll()),
  get: id => tx('readonly', s => s.get(id)),
  update: async (id, patch) => { const p = await Gallery.get(id); if (p) await tx('readwrite', s => s.put({ ...p, ...patch })); },
  remove: id => tx('readwrite', s => s.delete(id)),
};

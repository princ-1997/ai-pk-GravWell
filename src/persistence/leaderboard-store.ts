import type { LeaderboardRunRecord } from '../types';
import { openDB } from './db';

const STORE = 'leaderboard-runs';

export async function getRunByCacheKey(cacheKey: string): Promise<LeaderboardRunRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('cacheKey');
    const req = idx.get(cacheKey);
    req.onsuccess = () => resolve(req.result as LeaderboardRunRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putRun(record: LeaderboardRunRecord): Promise<void> {
  const db = await openDB();

  // Upsert: delete existing record with same cacheKey, then add new one
  const existing = await getRunByCacheKey(record.cacheKey);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    if (existing?.id != null) {
      store.delete(existing.id);
    }

    const cleaned = { ...record };
    delete cleaned.id;
    store.add(cleaned);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllRuns(): Promise<LeaderboardRunRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as LeaderboardRunRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getCompletedCacheKeys(
  model: string,
  configHash: string
): Promise<Set<string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('model');
    const req = idx.getAll(model);
    req.onsuccess = () => {
      const records = req.result as LeaderboardRunRecord[];
      const keys = new Set<string>();
      for (const r of records) {
        if (r.configHash === configHash) {
          keys.add(r.cacheKey);
        }
      }
      resolve(keys);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAllRuns(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

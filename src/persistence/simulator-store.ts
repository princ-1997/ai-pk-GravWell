import type { SimulatorRunRecord } from '../types';
import { openDB } from './db';

const STORE = 'simulator-runs';

export async function putSimulatorRun(record: SimulatorRunRecord): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const cleaned = { ...record };
    delete cleaned.id;
    const req = tx.objectStore(STORE).add(cleaned);
    req.onsuccess = () => resolve(req.result as number);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSimulatorRuns(): Promise<SimulatorRunRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as SimulatorRunRecord[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Returns the newest SimulatorRunRecord per cacheKey — for cache hydration on boot. */
export async function getLatestRunsByCacheKey(): Promise<Map<string, SimulatorRunRecord>> {
  const all = await getAllSimulatorRuns();
  const map = new Map<string, SimulatorRunRecord>();
  for (const record of all) {
    if (!map.has(record.cacheKey)) {
      map.set(record.cacheKey, record);
    }
  }
  return map;
}

export async function deleteSimulatorRun(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAllSimulatorRuns(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

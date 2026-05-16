import type { PvpBot, PvpMatchRecord } from '../types';
import { openDB } from './db';

const BOTS = 'pvp-bots';
const MATCHES = 'pvp-matches';

// ====== Bot CRUD ======

export async function getAllBots(): Promise<PvpBot[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BOTS, 'readonly').objectStore(BOTS).getAll();
    req.onsuccess = () => resolve(req.result as PvpBot[]);
    req.onerror = () => reject(req.error);
  });
}

export async function addBot(bot: PvpBot): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const cleaned = { ...bot };
    delete cleaned.id;
    const req = db.transaction(BOTS, 'readwrite').objectStore(BOTS).add(cleaned);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function updateBot(bot: PvpBot): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOTS, 'readwrite');
    tx.objectStore(BOTS).put(bot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBot(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOTS, 'readwrite');
    tx.objectStore(BOTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllBots(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOTS, 'readwrite');
    tx.objectStore(BOTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function resetAllElo(initialElo: number): Promise<void> {
  const db = await openDB();
  const bots = await getAllBots();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOTS, 'readwrite');
    const store = tx.objectStore(BOTS);
    for (const bot of bots) {
      store.put({ ...bot, elo: initialElo, wins: 0, losses: 0, draws: 0, matches: 0 });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ====== Match CRUD ======

export async function addMatch(record: PvpMatchRecord): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const cleaned = { ...record };
    delete cleaned.id;
    const req = db.transaction(MATCHES, 'readwrite').objectStore(MATCHES).add(cleaned);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllMatches(): Promise<PvpMatchRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(MATCHES, 'readonly').objectStore(MATCHES).getAll();
    req.onsuccess = () => {
      const all = (req.result as PvpMatchRecord[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMatch(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCHES, 'readwrite');
    tx.objectStore(MATCHES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllMatches(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCHES, 'readwrite');
    tx.objectStore(MATCHES).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

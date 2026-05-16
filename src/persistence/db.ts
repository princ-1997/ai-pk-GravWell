import type { GameConfig } from '../types';

const DB_NAME = 'gravwell-gpt';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // Leaderboard runs: one record per model × seed × config
      if (!db.objectStoreNames.contains('leaderboard-runs')) {
        const store = db.createObjectStore('leaderboard-runs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('cacheKey', 'cacheKey', { unique: true });
        store.createIndex('model', 'model', { unique: false });
        store.createIndex('configHash', 'configHash', { unique: false });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * djb2 hash of physics-affecting config fields.
 * Excludes seed (stored separately) and playerCount (always 1 for leaderboard).
 */
export function computeConfigHash(config: GameConfig): string {
  const parts = [
    config.totalTicks,
    config.shipsPerPlayer,
    config.fuelStart,
    config.maxThrust,
    config.conditionMax,
    config.predictionTicks,
    config.arenaSize,
    config.gravityConstant,
    config.gravitySoftening,
    config.sunCount,
    config.zoneBaseRadius,
  ].join('|');

  let hash = 5381;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) + hash + parts.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function makeCacheKey(model: string, configHash: string, seed: number): string {
  return `${model}::${configHash}::${seed}`;
}

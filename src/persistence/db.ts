import type { GameConfig } from '../types';
import { TOTAL_ROUNDS } from '../llm/multi-player-iteration-engine';

const DB_NAME = 'gravwell-gpt';
const DB_VERSION = 4; // v4: TOTAL_ROUNDS added to configHash, invalidates old cached runs

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // v1→v2: recreate leaderboard-runs (schema change)
      if (oldVersion < 2) {
        if (db.objectStoreNames.contains('leaderboard-runs')) {
          db.deleteObjectStore('leaderboard-runs');
        }
        const lbStore = db.createObjectStore('leaderboard-runs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        lbStore.createIndex('cacheKey', 'cacheKey', { unique: true });
        lbStore.createIndex('model', 'model', { unique: false });
        lbStore.createIndex('configHash', 'configHash', { unique: false });
      }

      // v2→v3: add simulator-runs store
      if (oldVersion < 3) {
        const simStore = db.createObjectStore('simulator-runs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        simStore.createIndex('cacheKey', 'cacheKey', { unique: false });
        simStore.createIndex('model', 'model', { unique: false });
        simStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // v3→v4: TOTAL_ROUNDS now part of configHash — clear leaderboard-runs cache
      if (oldVersion < 4) {
        if (db.objectStoreNames.contains('leaderboard-runs')) {
          db.transaction(['leaderboard-runs'], 'readwrite')
            .objectStore('leaderboard-runs')
            .clear();
        }
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
 * djb2 hash of physics-affecting config fields + TOTAL_ROUNDS.
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
    TOTAL_ROUNDS,
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

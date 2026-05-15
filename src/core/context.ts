import type { DecideContext, Ship, Sun, Vec2, ZonePrediction } from '../types';
import { distance } from '../utils/math';

/**
 * Build the ctx object passed to the decide() function.
 * All data is read-only snapshots - the bot cannot mutate game state.
 */
export function buildContext(
  ship: Ship,
  allShips: Ship[],
  suns: ReadonlyArray<Sun>,
  zone: { x: number; y: number; radius: number },
  predictions: ZonePrediction[],
  tick: number,
  totalTicks: number,
  seed: number
): DecideContext {
  // Snapshot the current ship (no references to mutable objects)
  const shipSnapshot = {
    id: ship.id,
    playerId: ship.playerId,
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    fuel: ship.fuel,
    alive: ship.alive,
    condition: ship.condition,
  };

  // Snapshot other ships
  const otherShips = allShips
    .filter(s => s.id !== ship.id)
    .map(s => ({
      id: s.id,
      playerId: s.playerId,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      fuel: s.fuel,
      alive: s.alive,
    }));

  const zoneSnapshot = { x: zone.x, y: zone.y, radius: zone.radius };

  const ctx: DecideContext = {
    ship: shipSnapshot,
    otherShips,
    suns,
    zone: zoneSnapshot,
    prediction: predictions,
    radius: zone.radius,
    tick,
    totalTicks,
    seed,

    distanceTo(a: Vec2, b: Vec2): number {
      return distance(a, b);
    },

    nearestSun(pos: Vec2): Sun {
      let nearest = suns[0];
      let nearestDist = Infinity;
      for (const sun of suns) {
        const d = distance(pos, sun);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = sun;
        }
      }
      return nearest;
    },

    nearestSunDist(pos: Vec2): number {
      let nearestDist = Infinity;
      for (const sun of suns) {
        const d = distance(pos, sun);
        if (d < nearestDist) {
          nearestDist = d;
        }
      }
      return nearestDist;
    },

    push(from: Vec2, to: Vec2, strength: number): Vec2 {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return { x: 0, y: 0 };
      const scale = Math.min(strength, 1) / dist;
      return { x: dx * scale, y: dy * scale };
    },

    nearestAlly(): { id: string; x: number; y: number; vx: number; vy: number } | null {
      let nearest: typeof otherShips[0] | null = null;
      let nearestDist = Infinity;
      for (const other of otherShips) {
        if (other.playerId === shipSnapshot.playerId && other.alive) {
          const d = distance(shipSnapshot, other);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = other;
          }
        }
      }
      if (!nearest) return null;
      return { id: nearest.id, x: nearest.x, y: nearest.y, vx: nearest.vx, vy: nearest.vy };
    },
  };

  return ctx;
}

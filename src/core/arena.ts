import type { ArenaData, Sun, Vec2 } from '../types';
import type { GameConfig } from '../types';
import { createPRNG, randRange } from './prng';
import { generateZonePath } from './zone';

/**
 * Generate sun positions, masses, and kill radii from a seed.
 * Suns are spread across the arena to create interesting gravitational fields.
 */
function generateSuns(rng: () => number, count: number): Sun[] {
  const suns: Sun[] = [];

  // Generate suns in different quadrants to create interesting dynamics
  const quadrants = [
    { minX: 15, maxX: 45, minY: 15, maxY: 45 },
    { minX: 55, maxX: 85, minY: 15, maxY: 45 },
    { minX: 15, maxX: 45, minY: 55, maxY: 85 },
    { minX: 55, maxX: 85, minY: 55, maxY: 85 },
  ];

  for (let i = 0; i < count; i++) {
    const q = quadrants[i % quadrants.length];
    const mass = randRange(rng, 1, 5);
    // Kill radius proportional to mass: bigger suns are more dangerous
    const radius = 1 + (mass - 1) * 1.0; // radius from 1 to 5

    suns.push({
      id: i,
      x: randRange(rng, q.minX, q.maxX),
      y: randRange(rng, q.minY, q.maxY),
      mass,
      radius,
    });
  }

  return suns;
}

/**
 * Generate starting positions for ships, avoiding suns.
 * In single-player, ships start near specific positions with initial velocity.
 */
function generateShipStartPositions(
  rng: () => number,
  playerCount: number,
  shipsPerPlayer: number,
  suns: Sun[]
): Array<{ x: number; y: number; vx: number; vy: number }> {
  const positions: Array<{ x: number; y: number; vx: number; vy: number }> = [];

  // Base starting positions for up to 4 players
  const playerStarts = [
    { baseX: 18, baseY: 18 },
    { baseX: 82, baseY: 81 },
    { baseX: 61, baseY: 17 },
    { baseX: 20, baseY: 80 },
  ];

  // Base initial velocity
  const baseVX = 0.06;
  const baseVY = 0.18;

  for (let p = 0; p < playerCount; p++) {
    const start = playerStarts[p % playerStarts.length];
    for (let s = 0; s < shipsPerPlayer; s++) {
      // Add small seed-based jitter to each ship
      const jitterX = (rng() - 0.5) * 4;
      const jitterY = (rng() - 0.5) * 4;
      const jitterVX = (rng() - 0.5) * 0.02;
      const jitterVY = (rng() - 0.5) * 0.02;

      let x = start.baseX + jitterX + s * 3;
      let y = start.baseY + jitterY + s * 3;

      // Make sure we're not starting inside a sun
      for (const sun of suns) {
        const dx = x - sun.x;
        const dy = y - sun.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < sun.radius + 5) {
          // Push away from sun
          x += (dx / dist) * (sun.radius + 6);
          y += (dy / dist) * (sun.radius + 6);
        }
      }

      // Clamp to arena
      x = Math.max(2, Math.min(98, x));
      y = Math.max(2, Math.min(98, y));

      positions.push({
        x,
        y,
        vx: baseVX + jitterVX,
        vy: baseVY + jitterVY,
      });
    }
  }

  return positions;
}

/**
 * Generate a complete arena from a seed and game config.
 */
export function generateArena(config: GameConfig): ArenaData {
  const rng = createPRNG(config.seed);
  const suns = generateSuns(rng, config.sunCount);
  const shipStartPositions = generateShipStartPositions(
    rng,
    config.playerCount,
    config.shipsPerPlayer,
    suns
  );
  const zonePath = generateZonePath(config.seed, config.totalTicks, suns);

  return {
    suns,
    zonePath,
    shipStartPositions,
  };
}

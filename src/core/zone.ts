import type { Vec2, ZonePrediction } from '../types';
import { createPRNG, randRange } from './prng';

export interface ZoneConfig {
  centerX: number;
  centerY: number;
  amplitudeX: number;
  amplitudeY: number;
  frequencyX: number;
  frequencyY: number;
  phaseX: number;
  phaseY: number;
}

/**
 * Generate zone path parameters from a seed.
 * Uses a Lissajous-like closed curve with seed-dependent parameters.
 */
export function generateZoneConfig(seed: number): ZoneConfig {
  const rng = createPRNG(seed + 777); // offset seed for zone

  return {
    centerX: randRange(rng, 35, 65),
    centerY: randRange(rng, 35, 65),
    amplitudeX: randRange(rng, 15, 30),
    amplitudeY: randRange(rng, 15, 30),
    frequencyX: 1 + Math.floor(rng() * 3), // 1, 2, or 3
    frequencyY: 1 + Math.floor(rng() * 3),
    phaseX: rng() * Math.PI * 2,
    phaseY: rng() * Math.PI * 2,
  };
}

/**
 * Generate the full zone path for a game.
 */
export function generateZonePath(seed: number, totalTicks: number): Vec2[] {
  const cfg = generateZoneConfig(seed);
  const path: Vec2[] = [];

  for (let t = 0; t < totalTicks; t++) {
    const angle = (t / totalTicks) * Math.PI * 2;
    const x = cfg.centerX + cfg.amplitudeX * Math.cos(cfg.frequencyX * angle + cfg.phaseX);
    const y = cfg.centerY + cfg.amplitudeY * Math.sin(cfg.frequencyY * angle + cfg.phaseY);

    // Clamp to arena with margin
    path.push({
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y)),
    });
  }

  return path;
}

/**
 * Get zone radius at a given tick.
 * Starts at baseRadius, gradually shrinks to create increasing difficulty.
 */
export function getZoneRadius(tick: number, totalTicks: number, baseRadius: number): number {
  const progress = tick / totalTicks;
  // Shrink from baseRadius to ~60% of baseRadius over the game
  const minFactor = 0.4;
  const factor = 1 - (1 - minFactor) * progress;
  return baseRadius * factor;
}

/**
 * Get zone predictions for the next N ticks.
 */
export function getZonePredictions(
  currentTick: number,
  count: number,
  zonePath: Vec2[],
  totalTicks: number,
  baseRadius: number
): ZonePrediction[] {
  const predictions: ZonePrediction[] = [];
  for (let i = 1; i <= count; i++) {
    const futureTick = currentTick + i;
    if (futureTick < zonePath.length) {
      predictions.push({
        tick: futureTick,
        x: zonePath[futureTick].x,
        y: zonePath[futureTick].y,
      });
    }
  }
  return predictions;
}

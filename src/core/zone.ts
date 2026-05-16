import type { Vec2, ZonePrediction, Sun } from '../types';
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

function catmullRomPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  };
}

/**
 * Generate the full zone path for a game.
 * When suns are provided, uses a Catmull-Rom spline through sun positions so
 * the zone repeatedly passes near/through each sun — ships must exit the zone
 * when it overlaps a sun and re-enter when it's clear.
 */
export function generateZonePath(seed: number, totalTicks: number, suns?: Sun[]): Vec2[] {
  if (suns && suns.length >= 2) {
    // Sort suns by angle around their centroid to get a non-crossing cyclic order
    const cx = suns.reduce((s, sun) => s + sun.x, 0) / suns.length;
    const cy = suns.reduce((s, sun) => s + sun.y, 0) / suns.length;
    const sorted = [...suns].sort((a, b) =>
      Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );

    const rng = createPRNG(seed + 777);
    const loops = 1 + Math.floor(rng() * 3); // 1–3 full loops through all suns
    const n = sorted.length;
    const path: Vec2[] = [];

    for (let tick = 0; tick < totalTicks; tick++) {
      const progress = (tick / totalTicks) * loops * n;
      const i = Math.floor(progress) % n;
      const localT = progress - Math.floor(progress);

      const p0 = sorted[(i - 1 + n) % n];
      const p1 = sorted[i];
      const p2 = sorted[(i + 1) % n];
      const p3 = sorted[(i + 2) % n];

      const pt = catmullRomPoint(p0, p1, p2, p3, localT);
      path.push({
        x: Math.max(5, Math.min(95, pt.x)),
        y: Math.max(5, Math.min(95, pt.y)),
      });
    }
    return path;
  }

  // Fallback: Lissajous curve (used when no sun data is available)
  const cfg = generateZoneConfig(seed);
  const path: Vec2[] = [];
  for (let t = 0; t < totalTicks; t++) {
    const angle = (t / totalTicks) * Math.PI * 2;
    const x = cfg.centerX + cfg.amplitudeX * Math.cos(cfg.frequencyX * angle + cfg.phaseX);
    const y = cfg.centerY + cfg.amplitudeY * Math.sin(cfg.frequencyY * angle + cfg.phaseY);
    path.push({ x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) });
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

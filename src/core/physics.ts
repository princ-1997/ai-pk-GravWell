import type { Ship, Sun, Vec2 } from '../types';
import { magnitude } from '../utils/math';

/**
 * Calculate total gravitational acceleration on a ship from all suns.
 * Formula: accel = G * sun.mass / (dist + softening)^2, directed toward sun.
 */
export function calculateGravity(
  ship: { x: number; y: number },
  suns: ReadonlyArray<Sun>,
  G: number,
  softening: number
): Vec2 {
  let gx = 0;
  let gy = 0;

  for (const sun of suns) {
    const dx = sun.x - ship.x;
    const dy = sun.y - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = dist + softening;
    const accel = G * sun.mass / (r * r);
    // Direction toward sun (normalized)
    if (dist > 0) {
      gx += accel * (dx / dist);
      gy += accel * (dy / dist);
    }
  }

  return { x: gx, y: gy };
}

/**
 * Verlet integration step.
 * next = current + (current - previous) + gravity + thrust
 *
 * Modifies ship in place.
 */
export function verletStep(
  ship: Ship,
  gravity: Vec2,
  thrust: Vec2
): void {
  // Velocity is implicit: v = current - previous
  const vx = ship.x - ship.previousX;
  const vy = ship.y - ship.previousY;

  // Store current as previous
  ship.previousX = ship.x;
  ship.previousY = ship.y;

  // Verlet: next = current + velocity + acceleration
  ship.x = ship.x + vx + gravity.x + thrust.x;
  ship.y = ship.y + vy + gravity.y + thrust.y;

  // Update explicit velocity for ctx reporting
  ship.vx = ship.x - ship.previousX;
  ship.vy = ship.y - ship.previousY;
}

/**
 * Clamp thrust vector magnitude to maxThrust.
 * Returns the clamped vector and the actual magnitude used (for fuel consumption).
 */
export function clampThrust(thrust: Vec2, maxThrust: number): { thrust: Vec2; magnitude: number } {
  const mag = magnitude(thrust);
  if (mag <= maxThrust) {
    return { thrust, magnitude: mag };
  }
  const scale = maxThrust / mag;
  return {
    thrust: { x: thrust.x * scale, y: thrust.y * scale },
    magnitude: maxThrust,
  };
}

/**
 * Check if a ship has collided with any sun (inside kill radius).
 */
export function checkSunCollision(
  ship: { x: number; y: number },
  suns: ReadonlyArray<Sun>
): Sun | null {
  for (const sun of suns) {
    const dx = ship.x - sun.x;
    const dy = ship.y - sun.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < sun.radius * sun.radius) {
      return sun;
    }
  }
  return null;
}

/**
 * Check if a ship is inside the scoring zone.
 */
export function isInZone(
  ship: { x: number; y: number },
  zone: { x: number; y: number; radius: number }
): boolean {
  const dx = ship.x - zone.x;
  const dy = ship.y - zone.y;
  return dx * dx + dy * dy <= zone.radius * zone.radius;
}

/**
 * Check if a ship is within the arena bounds.
 */
export function isInArena(
  ship: { x: number; y: number },
  arenaSize: number
): boolean {
  return ship.x >= 0 && ship.x <= arenaSize && ship.y >= 0 && ship.y <= arenaSize;
}

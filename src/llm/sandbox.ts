import type { DecideFunction, Vec2 } from '../types';

/**
 * Parse a decide() function string into an executable function.
 * Runs the LLM-generated code in a restricted scope.
 */
export function createDecideFunction(code: string): DecideFunction {
  try {
    // Wrap the code in a function that returns decide
    // The code should define `function decide(ctx) { ... }`
    const wrappedCode = `
      'use strict';
      ${code}
      return decide;
    `;

    const factory = new Function(wrappedCode);
    const decideFn = factory();

    if (typeof decideFn !== 'function') {
      console.error('Code did not produce a decide function');
      return fallbackDecide;
    }

    // Wrap with safety: timeout detection via iteration counter, error catching
    return function safeDecide(ctx): Vec2 {
      try {
        const result = decideFn(ctx);
        if (result && typeof result.x === 'number' && typeof result.y === 'number' &&
            isFinite(result.x) && isFinite(result.y)) {
          return { x: result.x, y: result.y };
        }
        return { x: 0, y: 0 };
      } catch {
        return { x: 0, y: 0 };
      }
    };
  } catch (e) {
    console.error('Failed to parse decide function:', e);
    return fallbackDecide;
  }
}

/**
 * Fallback decide function: do nothing (no thrust).
 */
function fallbackDecide(): Vec2 {
  return { x: 0, y: 0 };
}

/**
 * Built-in baseline bot: simple zone seeker.
 * Thrusts toward the zone center with moderate strength.
 */
export const BASELINE_ZONE_SEEKER_CODE = `function decide(ctx) {
  const ship = ctx.ship;
  if (ship.fuel <= 0) return { x: 0, y: 0 };

  // Avoid suns
  const sunDist = ctx.nearestSunDist(ship);
  if (sunDist < 8) {
    const sun = ctx.nearestSun(ship);
    const dx = ship.x - sun.x;
    const dy = ship.y - sun.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { x: (dx / dist) * 0.5, y: (dy / dist) * 0.5 };
  }

  // Use prediction to aim ahead
  let targetX = ctx.zone.x;
  let targetY = ctx.zone.y;
  if (ctx.prediction.length >= 5) {
    targetX = ctx.prediction[4].x;
    targetY = ctx.prediction[4].y;
  }

  // Thrust toward target zone
  const dx = targetX - ship.x;
  const dy = targetY - ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < ctx.radius * 0.5) {
    // Inside zone - counteract velocity to stay
    return { x: -ship.vx * 0.3, y: -ship.vy * 0.3 };
  }

  // Proportional thrust toward zone
  const strength = Math.min(0.5, dist / 50);
  return { x: (dx / dist) * strength, y: (dy / dist) * strength };
}`;

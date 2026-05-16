import type { GameConfig, Sun, Vec2 } from '../types';

/**
 * Build the full LLM prompt describing the game rules and current arena.
 */
export function buildPrompt(
  config: GameConfig,
  suns: ReadonlyArray<Sun>,
  shipStarts: Array<{ x: number; y: number; vx: number; vy: number }>,
  playerIndex: number
): { system: string; user: string } {
  const sunDescriptions = suns.map((s, i) =>
    `  Sun ${i}: position (${s.x.toFixed(1)}, ${s.y.toFixed(1)}), mass ${s.mass.toFixed(2)}, kill radius ${s.radius.toFixed(2)}`
  ).join('\n');

  const shipDescriptions = [];
  for (let s = 0; s < config.shipsPerPlayer; s++) {
    const idx = playerIndex * config.shipsPerPlayer + s;
    const sp = shipStarts[idx];
    shipDescriptions.push(
      `  Ship P${playerIndex + 1}S${s + 1}: start (${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}), velocity (${sp.vx.toFixed(3)}, ${sp.vy.toFixed(3)})`
    );
  }

  const system = `Write a Gravwell GPT bot for Player ${playerIndex + 1}.

Return exactly one JavaScript function:
function decide(ctx) { ... }

Function contract:
- This is not a fleet-level function. It controls exactly one ship for this tick.
- The engine calls decide(ctx) separately for each living ship on each tick.
- Use ctx.ship and ctx.otherShips to evaluate behavior for each ship.
- Return one thrust vector for the current ctx.ship only: {x: number, y: number}.
- The bot is a pure function of ctx. There is no ctx.memory. Do not rely on persistent state between calls.

Mechanics:
- ${config.arenaSize}x${config.arenaSize} continuous arena, ${config.totalTicks} ticks.
- Current seed: ${config.seed}.
- Controls: maxThrust=${config.maxThrust}, fuelStart=${config.fuelStart}, predictionTicks=${config.predictionTicks}.
- You control ${config.shipsPerPlayer} ships. This function is called once per ship per tick.
- Ship state: {id, playerId, x, y, vx, vy, fuel, alive}.
- Each tick you may return any thrust vector (x,y); magnitude is capped to ${config.maxThrust}.
- Fuel starts at ${config.fuelStart}. Thrust magnitude consumes that much fuel. No fuel means ballistic only.
- Motion uses Verlet integration plus gravity from ${config.sunCount} seed-specific suns.
- Scoring zone follows a deterministic path. ctx.prediction has the next ${config.predictionTicks} positions.
- Scoring zone starts with radius ~${config.zoneBaseRadius}. Each alive ship earns 1 point per tick inside it.
- Ships can fly outside the [0,${config.arenaSize}] x [0,${config.arenaSize}] arena without dying, but cannot score.
- Crashing into a sun (entering its kill radius) destroys the ship permanently.
- Treat sun clearance under about 5 units as high-risk because gravity becomes very strong.

ctx object properties:
- ctx.ship: {id, playerId, x, y, vx, vy, fuel, alive}
- ctx.otherShips: array of {id, playerId, x, y, vx, vy, fuel, alive}
- ctx.suns: array of {id, x, y, mass, radius}
- ctx.zone: {x, y, radius} - current scoring zone
- ctx.prediction: array of {tick, x, y} - next ${config.predictionTicks} zone positions
- ctx.tick: current tick number (0 to ${config.totalTicks - 1})

ctx helper functions:
- ctx.distanceTo(a, b): distance between two {x,y} points
- ctx.nearestSun(pos): returns the nearest sun to {x,y}
- ctx.nearestSunDist(pos): returns distance to nearest sun from {x,y}
- ctx.push(from, to, strength): returns thrust vector from 'from' toward 'to' with given strength (capped at 1)
- ctx.nearestAlly(): returns nearest ally ship or null

Current arena (seed ${config.seed}):
Suns:
${sunDescriptions}

Your ships:
${shipDescriptions}`;

  const user = `Write the decide(ctx) function. Think about:
1. How to navigate toward the scoring zone using predictions
2. How to manage fuel efficiently
3. How to avoid crashing into suns (gravity gets very strong near them)
4. How to account for gravity in your trajectory planning

Return ONLY the function code, no explanation.`;

  return { system, user };
}

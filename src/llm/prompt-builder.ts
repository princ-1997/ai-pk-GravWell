import type { GameConfig, Sun } from '../types';

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
- Controls exactly one ship per tick. The engine calls decide(ctx) for each living ship each tick.
- Return a thrust vector for ctx.ship only: {x: number, y: number}.
- Pure function of ctx — there is no ctx.memory, no persistent state between calls.

Mechanics:
- ${config.arenaSize}x${config.arenaSize} continuous arena, ${config.totalTicks} ticks total.
- Controls: maxThrust=${config.maxThrust}, fuelStart=${config.fuelStart}, predictionTicks=${config.predictionTicks}.
- You control ${config.shipsPerPlayer} ships (S1, S2, S3). decide() is called once per ship per tick.
- Ship state: {id, playerId, x, y, vx, vy, fuel, alive, condition}.
- Thrust: return any {x, y} vector; magnitude is capped to ${config.maxThrust}. Fuel cost = thrust magnitude per tick.
- Fuel starts at ${config.fuelStart} for the entire ${config.totalTicks}-tick game = ${(config.fuelStart / config.totalTicks).toFixed(2)} average/tick. No fuel → ballistic only.
- Motion: Verlet integration. next_pos = pos + (pos - prev_pos) + gravity + thrust.
- Gravity: accel = ${config.gravityConstant} × sun.mass / (dist + ${config.gravitySoftening})² toward each sun.
- Scoring zone: moves on a deterministic Lissajous path. Each alive ship earns 1 point/tick inside it.
- Zone radius starts at ~${config.zoneBaseRadius} and shrinks to ~${(config.zoneBaseRadius * 0.4).toFixed(0)} by tick ${config.totalTicks}.
- Crashing into a sun (distance ≤ kill radius) destroys the ship permanently.
- Ships outside [0,${config.arenaSize}] arena boundary do not die but cannot score.

ctx object:
- ctx.ship: {id, playerId, x, y, vx, vy, fuel, alive, condition}
- ctx.otherShips: array of other ships (all players)
- ctx.suns: array of {id, x, y, mass, radius}
- ctx.zone: {x, y, radius} — current scoring zone center and radius
- ctx.prediction: array of {tick, x, y} — next ${config.predictionTicks} zone positions
- ctx.tick: current tick (0 to ${config.totalTicks - 1})
- ctx.totalTicks: ${config.totalTicks}

ctx helpers:
- ctx.distanceTo(a, b): Euclidean distance between two {x,y} points
- ctx.nearestSun(pos): returns nearest Sun object to {x,y}
- ctx.nearestSunDist(pos): returns distance to nearest sun
- ctx.push(from, to, strength): normalized thrust vector from 'from' toward 'to', magnitude = min(strength, 1)
- ctx.seek(target, power=1): smarter version of push — subtracts 0.5× current velocity to reduce overshoot; good for precise zone docking
- ctx.nearestAlly(): nearest living friendly ship, or null

Multi-ship strategy:
- Use ctx.ship.id (e.g. "P${playerIndex + 1}S1", "P${playerIndex + 1}S2", "P${playerIndex + 1}S3") to assign different roles.
- Example: assign S1 as primary zone tracker, S2 as fuel-reserve backup, S3 as aggressive early scorer.
- Ships running low on fuel or near death can coast ballistically to conserve them for other ships.

Current arena:
Suns:
${sunDescriptions}

Your ships:
${shipDescriptions}`;

  const user = `Write the decide(ctx) function. Four trade-offs to resolve:

1. LEAD vs LAG: Aim at ctx.zone (current) or ctx.prediction[N] (future)?
   The zone moves. Your ship has momentum and is pulled by gravity.
   How many ticks ahead should you aim? Does this change over the course of the game?

2. FUEL BUDGET: ${config.fuelStart} fuel over ${config.totalTicks} ticks = ${(config.fuelStart / config.totalTicks).toFixed(2)}/tick average.
   When is full thrust (1.0) worth it vs coasting ballistically?
   Should all 3 ships burn equally, or should some conserve for the endgame?

3. SUN HAZARD vs SLINGSHOT: Gravity near suns can kill you OR help you.
   At what distance do you start avoidance? Can you use a sun's pull to reach the zone for free?

4. SHIP ROLES: All 3 ships start clustered near each other.
   Do they fly in formation, disperse, or specialize?
   What is your fallback when one ship dies?

Return ONLY the function code, no explanation.`;

  return { system, user };
}

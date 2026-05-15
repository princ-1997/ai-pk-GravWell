import type { DiagnosticReport } from './diagnostic';

/**
 * Build the improvement prompt for subsequent iteration rounds.
 * Sends previous code + diagnostic to the LLM for targeted improvement.
 */
export function buildImprovementPrompt(
  previousCode: string,
  diagnostic: DiagnosticReport,
  round: number
): { system: string; user: string } {
  const maxPossible = diagnostic.totalTicks * 3; // 3 ships × totalTicks

  const perShipLines = diagnostic.perShip.map(s => {
    const status = s.alive
      ? `survived`
      : `crashed tick ${s.crashedTick} into ${s.crashedInto}`;
    return `  ${s.id}: ${status}, zone_ticks=${s.ticksInZone}, fuel_remaining=${s.fuelRemaining.toFixed(1)}`;
  }).join('\n');

  const system = `You are improving a Gravwell GPT bot. This is improvement round ${round}.

Previous score: ${diagnostic.positiveScore} / ~${maxPossible} possible
${diagnostic.summary}

Per-ship results:
${perShipLines}

Fuel analysis:
  total_fuel_used=${diagnostic.totalFuelUsed.toFixed(1)}, avg_per_ship=${diagnostic.avgFuelPerShip.toFixed(1)}
  (each ship starts with ${diagnostic.totalFuelUsed > 0 ? Math.round((diagnostic.totalFuelUsed / diagnostic.shipsAlive + (diagnostic.shipsCrashed > 0 ? diagnostic.totalFuelUsed / (diagnostic.shipsAlive + diagnostic.shipsCrashed) : 0))) : 'N/A'} fuel — use it wisely over 200 ticks)

Focus on:
- Ships that crashed: fix sun avoidance near those tick numbers
- Ships with high fuel remaining: they were too conservative — thrust more toward zone
- Ships with low zone ticks: they missed the zone — improve approach trajectory
- Use gravity assists (let suns pull the ship in a useful direction) to save fuel

The function contract is unchanged:
- function decide(ctx) receives the same ctx object
- Return {x, y} thrust vector; magnitude is capped to 1.0
- No persistent state between calls
- ctx.prediction has the next 20 zone positions for trajectory planning`;

  const user = `Previous bot code (scored ${diagnostic.positiveScore} points):

\`\`\`javascript
${previousCode}
\`\`\`

Write an improved decide(ctx) function that addresses the specific weaknesses shown above.
Return ONLY the function code, no explanation.`;

  return { system, user };
}

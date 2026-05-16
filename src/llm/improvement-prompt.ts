import type { DiagnosticReport } from './diagnostic';

/**
 * One round's data for building the improvement prompt.
 */
export interface RoundHistoryEntry {
  round: number;
  code: string;
  score: number;
  diagnostic: DiagnosticReport;
}

/**
 * Build a compact per-ship summary line.
 */
function shipLine(s: DiagnosticReport['perShip'][number]): string {
  const status = s.alive
    ? 'alive'
    : `crashed@t${s.crashedTick}→${s.crashedInto}`;
  return `${s.id}: ${status}, zone=${s.ticksInZone}, fuel=${s.fuelRemaining.toFixed(1)}`;
}

/**
 * Build the improvement prompt for subsequent iteration rounds.
 * Includes compressed history of ALL previous rounds so the model can
 * see the full evolution trajectory and learn from both successes and failures.
 */
export function buildImprovementPrompt(
  history: RoundHistoryEntry[],
  currentRound: number
): { system: string; user: string } {
  const latest = history[history.length - 1];
  const maxPossible = latest.diagnostic.totalTicks * 3; // 3 ships × totalTicks
  const playerId = latest.diagnostic.perShip[0]?.id.substring(0, 2) || 'P1';

  // Find best round
  let bestIdx = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i].score > history[bestIdx].score) bestIdx = i;
  }
  const best = history[bestIdx];

  // ── Section 1: Score progression table ──
  const tableHeader = 'Round | Score | Alive | Crashed | ZoneTicks | FuelUsed';
  const tableSep    = '------+-------+-------+---------+-----------+---------';
  const tableRows = history.map(h => {
    const d = h.diagnostic;
    return `  R${h.round + 1}   |  ${String(h.score).padStart(4)} |   ${d.shipsAlive}   |    ${d.shipsCrashed}    |    ${String(d.totalTicksInZone).padStart(4)}   |  ${d.totalFuelUsed.toFixed(1)}`;
  }).join('\n');

  // ── Section 2: Per-round ship details (compact) ──
  const perRoundShips = history.map(h => {
    const lines = h.diagnostic.perShip.map(s => '    ' + shipLine(s)).join('\n');
    return `  R${h.round + 1} (score=${h.score}):\n${lines}`;
  }).join('\n');

  // ── Section 3: Trend analysis ──
  const scores = history.map(h => h.score);
  const trend = scores.length >= 2
    ? (scores[scores.length - 1] > scores[scores.length - 2]
        ? 'IMPROVING'
        : scores[scores.length - 1] === scores[scores.length - 2]
          ? 'FLAT'
          : 'REGRESSING')
    : 'FIRST_IMPROVEMENT';

  // ── Build system prompt ──
  const system = `You are improving a Gravwell GPT bot. This is round ${currentRound} of 5.
Your ships have IDs starting with "${playerId}". Other ships belong to opponents.
Max possible score: ~${maxPossible} (${latest.diagnostic.totalTicks} ticks × 3 ships).

═══ EVOLUTION HISTORY ═══
${tableHeader}
${tableSep}
${tableRows}

Trend: ${trend} | Best so far: R${best.round + 1} with ${best.score} pts

═══ PER-SHIP DETAILS (all rounds) ═══
${perRoundShips}

═══ LATEST ROUND ANALYSIS (R${latest.round + 1}) ═══
${latest.diagnostic.summary}
Fuel: total_used=${latest.diagnostic.totalFuelUsed.toFixed(1)}, avg_per_ship=${latest.diagnostic.avgFuelPerShip.toFixed(1)}

═══ IMPROVEMENT GUIDELINES ═══
- Crashed ships: fix sun avoidance near those tick numbers
- High fuel remaining: too conservative — thrust more toward zone
- Low zone ticks: missed the zone — improve approach trajectory
- Use gravity assists (let suns pull in a useful direction) to save fuel
- If score is REGRESSING, revert toward the best-scoring strategy and make smaller changes
- If score is FLAT, try a different approach (e.g., different prediction lookahead, different fuel allocation)

The function contract is unchanged:
- function decide(ctx) receives the same ctx object
- Return {x, y} thrust vector; magnitude is capped to 1.0
- No persistent state between calls
- ctx.prediction has the next 5 zone positions for trajectory planning
- ctx.seek(target, power=1) reduces overshoot by correcting for current velocity`;

  // ── Build user prompt ──
  // Include best code + latest code (if different)
  let codeSection: string;
  if (bestIdx === history.length - 1) {
    // Best IS the latest
    codeSection = `Your best & latest code (R${latest.round + 1}, score=${latest.score}):

\`\`\`javascript
${latest.code}
\`\`\``;
  } else {
    codeSection = `Your BEST code so far (R${best.round + 1}, score=${best.score}):

\`\`\`javascript
${best.code}
\`\`\`

Your LATEST code (R${latest.round + 1}, score=${latest.score}):

\`\`\`javascript
${latest.code}
\`\`\``;
  }

  const user = `${codeSection}

Write an improved decide(ctx) function. Consider the full evolution history above.
${trend === 'REGRESSING' ? 'WARNING: Score dropped last round. Start from the best code and make targeted, small improvements.' : ''}
Return ONLY the function code, no explanation.`;

  return { system, user };
}

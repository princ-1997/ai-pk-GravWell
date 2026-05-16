import type { ArenaData, MatchRunResult, PvpBot, TickRecord } from '../types';
import type { GameConfig } from '../types';
import { DEFAULT_CONFIG } from '../constants';
import { generateArena } from '../core/arena';
import { Simulation } from '../core/simulation';
import { createDecideFunction } from '../llm/sandbox';
import { applyMatchElo } from './elo';
import { getAllRuns } from '../persistence/leaderboard-store';

/**
 * Run a fair N-bot match on the given seed.
 *
 * For N bots, runs N sub-simulations. In sub-sim k, bot i is assigned to
 * physical start position slot (i+k)%N. Each bot plays from every position
 * exactly once; final score = average across rotations.
 */
export function runFairMatch(
  bots: PvpBot[],
  seed: number,
  baseConfig: GameConfig = DEFAULT_CONFIG
): MatchRunResult {
  const N = bots.length;
  const config: GameConfig = { ...baseConfig, seed, playerCount: N };
  const baseArena: ArenaData = generateArena(config);
  const shipsPerPlayer = config.shipsPerPlayer;

  const totalScores = new Array(N).fill(0);
  const perRotationScores: number[][] = [];
  const ticksPerRotation: TickRecord[][] = [];

  const deciders = bots.map(b => createDecideFunction(b.code));

  for (let k = 0; k < N; k++) {
    // Rearrange start positions: player i gets slot (i+k)%N's positions
    const newPositions: ArenaData['shipStartPositions'] = [];
    for (let i = 0; i < N; i++) {
      const src = (i + k) % N;
      for (let s = 0; s < shipsPerPlayer; s++) {
        newPositions.push(baseArena.shipStartPositions[src * shipsPerPlayer + s]);
      }
    }
    const arenaK: ArenaData = { ...baseArena, shipStartPositions: newPositions };

    const sim = new Simulation(config, arenaK);
    const result = sim.runToCompletion(deciders);

    for (let i = 0; i < N; i++) totalScores[i] += result.finalScores[i];
    perRotationScores.push([...result.finalScores]);
    ticksPerRotation.push(result.ticks);
  }

  const avgScores = totalScores.map(s => s / N);
  const rank = avgScores.map((_, i) => i).sort((a, b) => avgScores[b] - avgScores[a]);
  const eloChanges = applyMatchElo(
    bots.map(b => b.elo),
    rank,
    avgScores
  );

  return { avgScores, perRotationScores, ticksPerRotation, rank, eloChanges };
}

export interface LeaderboardBotCandidate {
  model: string;
  provider: string;
  bestScore: number;
  sourceSeed: number;
  sourceRound: number;
  code: string;
}

/**
 * Scan all leaderboard records and return the globally best (seed, round)
 * code for each distinct model.
 */
export async function getBestCodePerModel(): Promise<LeaderboardBotCandidate[]> {
  const runs = await getAllRuns();
  const best = new Map<string, LeaderboardBotCandidate>();

  for (const run of runs) {
    for (let r = 0; r < run.roundResults.length; r++) {
      const roundResult = run.roundResults[r];
      // Each round has players; for leaderboard runs there is 1 player (index 0)
      const playerData = roundResult.players[0];
      if (!playerData) continue;

      const score = playerData.score;
      const existing = best.get(run.model);
      if (!existing || score > existing.bestScore) {
        best.set(run.model, {
          model: run.model,
          provider: run.provider,
          bestScore: score,
          sourceSeed: run.seed,
          sourceRound: r + 1,
          code: playerData.code,
        });
      }
    }
  }

  return Array.from(best.values()).sort((a, b) => b.bestScore - a.bestScore);
}

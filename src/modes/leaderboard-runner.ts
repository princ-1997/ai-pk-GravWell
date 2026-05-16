import type { ApiProvider, GameConfig, LeaderboardRunRecord, RoundResult } from '../types';
import { LEADERBOARD_SEEDS } from '../constants';
import { PLAYER_COLORS } from '../constants';
import { MultiPlayerIterationEngine, TOTAL_ROUNDS } from '../llm/multi-player-iteration-engine';
import { computeConfigHash, makeCacheKey } from '../persistence/db';
import { getCompletedCacheKeys, getRunByCacheKey, putRun } from '../persistence/leaderboard-store';

export interface LeaderboardModelEntry {
  provider: ApiProvider;
  apiKey: string;
  model: string;
}

export interface LeaderboardCallbacks {
  onModelStart(model: string, modelIndex: number, totalModels: number): void;
  onSeedStart(model: string, seed: number, fromCache: boolean): void;
  onSeedProgress(model: string, seed: number, round: number, totalRounds: number): void;
  onSeedComplete(model: string, seed: number, score: number, fromCache: boolean): void;
  onModelComplete(model: string, result: LeaderboardResult): void;
  onAllComplete(results: LeaderboardResult[]): void;
  onError(model: string, seed: number, error: string): void;
}

export interface LeaderboardResult {
  model: string;
  provider: ApiProvider;
  scores: Array<{ seed: number; score: number }>;
  avgScore: number;
  medianScore: number;
  stddev: number;
  minScore: number;
  maxScore: number;
  totalTokens: { input: number; output: number };
}

export class LeaderboardRunner {
  private stopped = false;
  private currentEngine: MultiPlayerIterationEngine | null = null;

  stop(): void {
    this.stopped = true;
    this.currentEngine?.stop();
  }

  async run(
    entries: LeaderboardModelEntry[],
    baseConfig: GameConfig,
    callbacks: LeaderboardCallbacks
  ): Promise<LeaderboardResult[]> {
    this.stopped = false;
    const allResults: LeaderboardResult[] = [];
    const cfgHash = computeConfigHash(baseConfig);

    for (let mi = 0; mi < entries.length; mi++) {
      if (this.stopped) break;

      const entry = entries[mi];
      callbacks.onModelStart(entry.model, mi, entries.length);

      const completedKeys = await getCompletedCacheKeys(entry.model, cfgHash);
      const seedScores: Array<{ seed: number; score: number }> = [];
      let totalInput = 0;
      let totalOutput = 0;

      for (const seed of LEADERBOARD_SEEDS) {
        if (this.stopped) break;

        const cacheKey = makeCacheKey(entry.model, cfgHash, seed);

        // Check cache
        if (completedKeys.has(cacheKey)) {
          const cached = await getRunByCacheKey(cacheKey);
          if (cached) {
            seedScores.push({ seed, score: cached.finalScore });
            totalInput += cached.totalTokens.input;
            totalOutput += cached.totalTokens.output;
            callbacks.onSeedStart(entry.model, seed, true);
            callbacks.onSeedComplete(entry.model, seed, cached.finalScore, true);
            continue;
          }
        }

        // Run fresh benchmark
        callbacks.onSeedStart(entry.model, seed, false);

        const config: GameConfig = { ...baseConfig, seed, playerCount: 1 };
        const player = {
          id: 0,
          provider: entry.provider,
          apiKey: entry.apiKey,
          model: entry.model,
          color: PLAYER_COLORS[0],
          label: entry.model,
        };

        const roundResults: RoundResult[] = [];
        let seedError = false;

        const engine = new MultiPlayerIterationEngine({
          onRoundStart: (round, total) => {
            callbacks.onSeedProgress(entry.model, seed, round, total);
          },
          onRoundComplete: (result) => {
            roundResults.push(result);
          },
          onAllComplete: () => {},
          onError: (_round, _playerId, msg) => {
            callbacks.onError(entry.model, seed, msg);
            seedError = true;
          },
          onPlayerLLMStart: () => {},
          onPlayerLLMComplete: () => {},
        });

        this.currentEngine = engine;

        try {
          await engine.run(config, [player]);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          callbacks.onError(entry.model, seed, msg);
          seedError = true;
        }

        this.currentEngine = null;

        if (this.stopped) break;

        // Only persist complete runs (all rounds)
        if (roundResults.length === TOTAL_ROUNDS && !seedError) {
          const finalScore = roundResults[TOTAL_ROUNDS - 1].players[0].score;

          // Sum tokens across all rounds
          let seedInput = 0;
          let seedOutput = 0;
          for (const rr of roundResults) {
            seedInput += rr.players[0].tokensUsed.input;
            seedOutput += rr.players[0].tokensUsed.output;
          }

          const record: LeaderboardRunRecord = {
            cacheKey,
            model: entry.model,
            provider: entry.provider,
            seed,
            configHash: cfgHash,
            roundResults,
            finalScore,
            totalTokens: { input: seedInput, output: seedOutput },
            timestamp: Date.now(),
          };

          await putRun(record);
          seedScores.push({ seed, score: finalScore });
          totalInput += seedInput;
          totalOutput += seedOutput;
          callbacks.onSeedComplete(entry.model, seed, finalScore, false);
        } else if (roundResults.length > 0) {
          // Partial run — use last available score but don't persist
          const lastScore = roundResults[roundResults.length - 1].players[0].score;
          seedScores.push({ seed, score: lastScore });
          callbacks.onSeedComplete(entry.model, seed, lastScore, false);
        }

        // Yield to UI thread
        await new Promise(r => setTimeout(r, 0));
      }

      if (this.stopped && seedScores.length === 0) break;

      const result = computeLeaderboardResult(
        entry.model,
        entry.provider,
        seedScores,
        { input: totalInput, output: totalOutput }
      );
      allResults.push(result);
      callbacks.onModelComplete(entry.model, result);
    }

    callbacks.onAllComplete(allResults);
    return allResults;
  }
}

function computeLeaderboardResult(
  model: string,
  provider: ApiProvider,
  scores: Array<{ seed: number; score: number }>,
  totalTokens: { input: number; output: number }
): LeaderboardResult {
  if (scores.length === 0) {
    return {
      model, provider, scores,
      avgScore: 0, medianScore: 0, stddev: 0,
      minScore: 0, maxScore: 0, totalTokens,
    };
  }

  const vals = scores.map(s => s.score);
  const sorted = [...vals].sort((a, b) => a - b);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = vals.reduce((sum, s) => sum + (s - avg) ** 2, 0) / vals.length;
  const stddev = Math.sqrt(variance);

  return {
    model, provider, scores,
    avgScore: avg,
    medianScore: median,
    stddev,
    minScore: sorted[0],
    maxScore: sorted[sorted.length - 1],
    totalTokens,
  };
}

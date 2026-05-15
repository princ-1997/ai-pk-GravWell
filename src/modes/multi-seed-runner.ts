import type { GameConfig, DecideFunction } from '../types';
import { Simulation } from '../core/simulation';
import { generateDiagnostic } from '../llm/diagnostic';

export interface MultiSeedResult {
  seed: number;
  score: number;
  shipsAlive: number;
  shipsCrashed: number;
  fuelUsed: number;
  ticksInZone: number;
}

export interface MultiSeedSummary {
  results: MultiSeedResult[];
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  minSeed: number;
  maxSeed: number;
}

export interface MultiSeedCallbacks {
  onSeedComplete: (result: MultiSeedResult, index: number, total: number) => void;
  onAllComplete: (summary: MultiSeedSummary) => void;
}

export class MultiSeedRunner {
  private stopped = false;

  stop(): void {
    this.stopped = true;
  }

  async run(
    baseConfig: GameConfig,
    seeds: number[],
    decide: DecideFunction,
    callbacks: MultiSeedCallbacks
  ): Promise<MultiSeedSummary | null> {
    this.stopped = false;
    const results: MultiSeedResult[] = [];

    for (let i = 0; i < seeds.length; i++) {
      if (this.stopped) break;

      const seed = seeds[i];
      const config = { ...baseConfig, seed };
      const sim = new Simulation(config);
      const simResult = sim.runToCompletion([decide]);
      const diag = generateDiagnostic(simResult, config);

      const result: MultiSeedResult = {
        seed,
        score: diag.positiveScore,
        shipsAlive: diag.shipsAlive,
        shipsCrashed: diag.shipsCrashed,
        fuelUsed: diag.totalFuelUsed,
        ticksInZone: diag.totalTicksInZone,
      };

      results.push(result);
      callbacks.onSeedComplete(result, i, seeds.length);

      // Yield to UI thread every 5 seeds
      if (i % 5 === 4) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (results.length === 0) return null;

    const summary = computeSummary(results);
    callbacks.onAllComplete(summary);
    return summary;
  }
}

function computeSummary(results: MultiSeedResult[]): MultiSeedSummary {
  const scores = results.map(r => r.score);
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const minSeed = results.find(r => r.score === min)!.seed;
  const maxSeed = results.find(r => r.score === max)!.seed;

  return { results, mean, median, stddev, min, max, minSeed, maxSeed };
}

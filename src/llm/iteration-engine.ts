import type { GameConfig } from '../types';
import { Simulation } from '../core/simulation';
import { callLLM, type ApiProvider } from './api';
import { buildPrompt } from './prompt-builder';
import { buildImprovementPrompt } from './improvement-prompt';
import { parseDecideCode } from './code-parser';
import { createDecideFunction } from './sandbox';
import { generateDiagnostic, type DiagnosticReport } from './diagnostic';

export interface IterationRecord {
  round: number;
  code: string;
  score: number;
  diagnostic: DiagnosticReport;
  tokensUsed: { input: number; output: number };
}

export interface IterationConfig {
  maxRounds: number;
  scoreThreshold: number;       // Stop early if score >= this value
  noImprovementRounds: number;  // Stop early after N consecutive non-improving rounds
}

export interface IterationCallbacks {
  onRoundStart: (round: number, maxRounds: number) => void;
  onRoundComplete: (record: IterationRecord) => void;
  onIterationDone: (records: IterationRecord[], bestRound: number) => void;
  onError: (round: number, error: string) => void;
}

const DEFAULT_CONFIG: IterationConfig = {
  maxRounds: 5,
  scoreThreshold: 9999,
  noImprovementRounds: 3,
};

export class IterationEngine {
  private config: IterationConfig;
  private callbacks: IterationCallbacks;
  private stopped = false;

  constructor(config: Partial<IterationConfig>, callbacks: IterationCallbacks) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  stop(): void {
    this.stopped = true;
  }

  async run(
    gameConfig: GameConfig,
    provider: ApiProvider,
    apiKey: string,
    model: string
  ): Promise<IterationRecord[]> {
    this.stopped = false;
    const records: IterationRecord[] = [];

    // Create one simulation to extract arena layout (reused for prompt building)
    const arenaSimulation = new Simulation(gameConfig);

    let bestScore = -1;
    let noImprovementCount = 0;
    let previousCode: string | null = null;
    let previousDiagnostic: DiagnosticReport | null = null;

    for (let round = 1; round <= this.config.maxRounds; round++) {
      if (this.stopped) break;

      this.callbacks.onRoundStart(round, this.config.maxRounds);

      try {
        // Build appropriate prompt for this round
        let systemPrompt: string;
        let userPrompt: string;

        if (round === 1 || !previousCode || !previousDiagnostic) {
          const { system, user } = buildPrompt(
            gameConfig,
            arenaSimulation.arena.suns,
            arenaSimulation.arena.shipStartPositions,
            0
          );
          systemPrompt = system;
          userPrompt = user;
        } else {
          const { system, user } = buildImprovementPrompt(
            previousCode,
            previousDiagnostic,
            round
          );
          systemPrompt = system;
          userPrompt = user;
        }

        // Call LLM
        const response = await callLLM(apiKey, provider, model, systemPrompt, userPrompt);
        const code = parseDecideCode(response.content);
        const decide = createDecideFunction(code);

        // Run simulation with fresh instance (ensures determinism per round)
        const sim = new Simulation(gameConfig);
        const result = sim.runToCompletion([decide]);
        const diagnostic = generateDiagnostic(result, gameConfig);

        const record: IterationRecord = {
          round,
          code,
          score: diagnostic.positiveScore,
          diagnostic,
          tokensUsed: {
            input: response.usage.inputTokens,
            output: response.usage.outputTokens,
          },
        };

        records.push(record);
        this.callbacks.onRoundComplete(record);

        previousCode = code;
        previousDiagnostic = diagnostic;

        // Check stopping conditions
        if (diagnostic.positiveScore >= this.config.scoreThreshold) break;

        if (diagnostic.positiveScore > bestScore) {
          bestScore = diagnostic.positiveScore;
          noImprovementCount = 0;
        } else {
          noImprovementCount++;
          if (noImprovementCount >= this.config.noImprovementRounds) break;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.callbacks.onError(round, msg);
        break;
      }
    }

    const bestRound = records.length > 0
      ? records.reduce((best, r) => r.score > records[best - 1].score ? r.round : best, 1)
      : 1;

    this.callbacks.onIterationDone(records, bestRound);

    return records;
  }
}

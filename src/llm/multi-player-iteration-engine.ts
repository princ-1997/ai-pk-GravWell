import type { GameConfig, Player, PlayerRoundData, RoundResult } from '../types';
import { Simulation } from '../core/simulation';
import { callLLM } from './api';
import { buildPrompt } from './prompt-builder';
import { buildImprovementPrompt, type RoundHistoryEntry } from './improvement-prompt';
import { parseDecideCode } from './code-parser';
import { createDecideFunction, BASELINE_ZONE_SEEKER_CODE } from './sandbox';
import { generatePlayerDiagnostic, type DiagnosticReport } from './diagnostic';

export const TOTAL_ROUNDS = 5;

export interface MPIterationCallbacks {
  onRoundStart: (round: number, totalRounds: number) => void;
  onRoundComplete: (result: RoundResult) => void;
  onAllComplete: (results: RoundResult[]) => void;
  onError: (round: number, playerId: number, error: string) => void;
  onPlayerLLMStart: (round: number, playerId: number) => void;
  onPlayerLLMComplete: (round: number, playerId: number) => void;
}

interface PlayerState {
  history: RoundHistoryEntry[];
}

export class MultiPlayerIterationEngine {
  private callbacks: MPIterationCallbacks;
  private stopped = false;

  constructor(callbacks: MPIterationCallbacks) {
    this.callbacks = callbacks;
  }

  stop(): void {
    this.stopped = true;
  }

  async run(
    gameConfig: GameConfig,
    players: Player[]
  ): Promise<RoundResult[]> {
    this.stopped = false;
    const results: RoundResult[] = [];

    // Use a reference simulation for arena layout (prompts need sun positions)
    const config = { ...gameConfig, playerCount: players.length };
    const arenaRef = new Simulation(config);

    // Per-player state across rounds — now stores full history
    const playerStates: PlayerState[] = players.map(() => ({
      history: [],
    }));

    for (let round = 0; round < TOTAL_ROUNDS; round++) {
      if (this.stopped) break;

      this.callbacks.onRoundStart(round, TOTAL_ROUNDS);

      // 1. All players call LLM in parallel
      const llmResults = await Promise.all(
        players.map(async (player, idx) => {
          // Baseline player: skip LLM, use static code
          if (!player.provider) {
            return {
              code: BASELINE_ZONE_SEEKER_CODE,
              systemPrompt: '',
              userPrompt: '',
              rawResponse: '',
              tokensUsed: { input: 0, output: 0 },
            };
          }

          this.callbacks.onPlayerLLMStart(round, player.id);

          try {
            const ps = playerStates[idx];
            let systemPrompt: string;
            let userPrompt: string;

            if (round === 0 || ps.history.length === 0) {
              // First round: use initial prompt
              const prompts = buildPrompt(
                config,
                arenaRef.arena.suns,
                arenaRef.arena.shipStartPositions,
                idx
              );
              systemPrompt = prompts.system;
              userPrompt = prompts.user;
            } else {
              // Subsequent rounds: use improvement prompt with FULL history
              const prompts = buildImprovementPrompt(
                ps.history,
                round + 1
              );
              systemPrompt = prompts.system;
              userPrompt = prompts.user;
            }

            const response = await callLLM(
              player.apiKey, player.provider, player.model,
              systemPrompt, userPrompt
            );
            const code = parseDecideCode(response.content);

            this.callbacks.onPlayerLLMComplete(round, player.id);

            return {
              code,
              systemPrompt,
              userPrompt,
              rawResponse: response.content,
              tokensUsed: {
                input: response.usage.inputTokens,
                output: response.usage.outputTokens,
              },
            };
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            this.callbacks.onError(round, player.id, msg);
            this.callbacks.onPlayerLLMComplete(round, player.id);

            // Fallback: reuse best code from history, or baseline
            const fallbackCode = this.getBestCode(playerStates[idx]) || BASELINE_ZONE_SEEKER_CODE;
            return {
              code: fallbackCode,
              systemPrompt: '',
              userPrompt: '',
              rawResponse: `[Error: ${msg}]`,
              tokensUsed: { input: 0, output: 0 },
            };
          }
        })
      );

      if (this.stopped) break;

      // 2. Create decide functions
      const deciders = llmResults.map(r => createDecideFunction(r.code));

      // 3. Run shared simulation
      const sim = new Simulation(config);
      const simResult = sim.runToCompletion(deciders);

      // 4. Generate per-player diagnostics and build round data
      const playerRoundData: PlayerRoundData[] = players.map((player, idx) => {
        const diagnostic = generatePlayerDiagnostic(simResult, config, idx);

        // Append to player's full history
        playerStates[idx].history.push({
          round,
          code: llmResults[idx].code,
          score: simResult.finalScores[idx],
          diagnostic,
        });

        return {
          playerId: player.id,
          code: llmResults[idx].code,
          score: simResult.finalScores[idx],
          diagnostic,
          tokensUsed: llmResults[idx].tokensUsed,
          systemPrompt: llmResults[idx].systemPrompt,
          userPrompt: llmResults[idx].userPrompt,
          rawResponse: llmResults[idx].rawResponse,
        };
      });

      // 5. Store round result with full tick data for replay
      const roundResult: RoundResult = {
        round,
        ticks: simResult.ticks,
        players: playerRoundData,
      };

      results.push(roundResult);
      this.callbacks.onRoundComplete(roundResult);
    }

    this.callbacks.onAllComplete(results);
    return results;
  }

  /** Get the best-scoring code from a player's history, or null if no history. */
  private getBestCode(state: PlayerState): string | null {
    if (state.history.length === 0) return null;
    let best = state.history[0];
    for (let i = 1; i < state.history.length; i++) {
      if (state.history[i].score > best.score) best = state.history[i];
    }
    return best.code;
  }
}

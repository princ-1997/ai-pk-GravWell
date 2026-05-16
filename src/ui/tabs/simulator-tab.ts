import type { Player, RoundResult } from '../../types';
import type { AppState, Tab } from '../app';
import { Simulation } from '../../core/simulation';
import { GameRenderer } from '../../renderer/game-renderer';
import { MultiPlayerIterationEngine, TOTAL_ROUNDS } from '../../llm/multi-player-iteration-engine';
import { ApiConfig } from '../components/api-config';
import { CodeEditor } from '../components/code-editor';
import { ReplayControls } from '../components/replay-controls';

export class SimulatorTab implements Tab {
  el: HTMLElement;
  private state: AppState;
  private renderer!: GameRenderer;
  private simulation: Simulation | null = null;
  private engine: MultiPlayerIterationEngine | null = null;

  // Replay internals
  private replayAnimId = 0;
  private lastFrameTime = 0;

  // Components
  private apiConfig!: ApiConfig;
  private codeEditor!: CodeEditor;
  private replayControls!: ReplayControls;

  constructor(state: AppState) {
    this.state = state;
    this.el = document.createElement('div');
    this.buildLayout();
  }

  private buildLayout(): void {
    this.el.innerHTML = `
      <div class="simulator-layout">
        <div class="simulator-left">
          <div class="simulator-header">
            <div class="game-title">GRAVWELL GPT</div>
            <div class="game-stats">
              <div><span class="stat-label">SEED</span><br><span class="stat-value" id="stat-seed">${this.state.config.seed}</span></div>
              <div><span class="stat-label">TICK</span><br><span class="stat-value" id="stat-tick">0 / ${this.state.config.totalTicks}</span></div>
              <div><span class="stat-label">SCORE</span><br><span class="stat-value" id="stat-score">0</span></div>
              <div><span class="stat-label">WINNER</span><br><span class="stat-value" id="stat-winner">-</span></div>
            </div>
          </div>
          <div class="canvas-container">
            <canvas id="game-canvas"></canvas>
          </div>
        </div>
        <div class="simulator-right" id="sim-right-panel"></div>
      </div>
    `;

    const rightPanel = this.el.querySelector('#sim-right-panel') as HTMLElement;

    // 1. API Config with player management
    this.apiConfig = new ApiConfig(rightPanel, {
      onStatusMessage: (html, type) => this.replayControls.showStatus(html, type),
      onAddPlayer: (player) => this.addPlayer(player),
      onRemovePlayer: (id) => this.removePlayer(id),
    });

    // 2. Game Config
    const gameConfigEl = document.createElement('div');
    gameConfigEl.className = 'panel-section';
    gameConfigEl.innerHTML = `
      <div class="panel-section-title">Game Configuration</div>
      <div class="field-row">
        <label class="field-label">SEED</label>
        <input type="number" class="field-input" id="seed-input" value="${this.state.config.seed}">
      </div>
    `;
    rightPanel.appendChild(gameConfigEl);

    gameConfigEl.querySelector('#seed-input')!.addEventListener('change', () => {
      const seed = parseInt((gameConfigEl.querySelector('#seed-input') as HTMLInputElement).value) || 9001;
      this.state.config = { ...this.state.config, seed };
      this.initializeSimulation();
      this.el.querySelector('#stat-seed')!.textContent = String(seed);
    });

    // 3. Code Editor (PLAY / STOP / LOAD BASELINE + code view)
    this.codeEditor = new CodeEditor(rightPanel, {
      onPlay: () => this.startBenchmark(),
      onStop: () => this.stopBenchmark(),
      onLoadBaseline: () => this.loadBaseline(),
      onPlayerRoundSelect: (playerId, round) => this.selectPlayerCode(playerId, round),
    });

    // 4. Replay Controls (round slider + speed + chart + results)
    this.replayControls = new ReplayControls(rightPanel, this.state, {
      onPlay: () => this.playReplay(),
      onStop: () => this.stopReplay(),
      onRoundSelect: (round) => this.selectRound(round),
    });

    // Setup canvas
    this.setupCanvas();
    this.initializeSimulation();
  }

  private setupCanvas(): void {
    const canvas = this.el.querySelector('#game-canvas') as HTMLCanvasElement;
    this.renderer = new GameRenderer(canvas);

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.renderCurrentState();
    });
  }

  onActivate(): void {
    this.renderer.resize();
    this.renderCurrentState();
    // Re-render score chart (canvas may have been zeroed while tab was hidden)
    this.replayControls.refreshChart();
  }

  onDeactivate(): void {
    this.stopReplay();
  }

  // ====== Player Management ======
  private addPlayer(player: Player): void {
    // Add to state if not already there
    if (!this.state.players.find(p => p.id === player.id)) {
      this.state.players.push(player);
    }
    this.state.config = { ...this.state.config, playerCount: this.state.players.length };
    this.codeEditor.setPlayers(this.state.players);
    this.initializeSimulation();
  }

  private removePlayer(playerId: number): void {
    this.state.players = this.state.players.filter(p => p.id !== playerId);
    this.state.config = { ...this.state.config, playerCount: Math.max(1, this.state.players.length) };
    this.codeEditor.setPlayers(this.state.players);
    this.initializeSimulation();
    // Clear old results since player count changed
    this.state.roundResults = [];
    this.codeEditor.setRounds(0);
    this.replayControls.updateRoundSlider(0, 0);
    this.replayControls.renderScoreChart([], []);
    this.replayControls.renderPlayerStats([]);
  }

  private loadBaseline(): void {
    this.apiConfig.addBaselinePlayer();
  }

  // ====== Simulation ======
  private initializeSimulation(): void {
    this.simulation = new Simulation(this.state.config);
    this.state.replayTicks = [];
    this.state.replayIndex = 0;
    this.renderer.clearTrails();

    const zone = this.simulation.getZone();
    this.renderer.renderInitial(this.simulation.arena.suns, zone);
    this.replayControls.updateStats(0, new Array(this.state.config.playerCount).fill(0), '-');
  }

  // ====== Benchmark (Multi-Player Iteration) ======
  private async startBenchmark(): Promise<void> {
    if (this.state.players.length === 0) {
      this.replayControls.showStatus('Add at least one player first.', 'error');
      return;
    }

    // Validate LLM players have keys
    const llmPlayers = this.state.players.filter(p => p.provider !== null);
    for (const p of llmPlayers) {
      if (!p.apiKey) {
        this.replayControls.showStatus(`Player ${p.id + 1} (${p.label}) has no API key.`, 'error');
        return;
      }
    }

    this.state.benchmarkRunning = true;
    this.state.roundResults = [];
    this.state.config = { ...this.state.config, playerCount: this.state.players.length };
    this.codeEditor.setRunning(true);
    this.codeEditor.setRounds(0);
    this.replayControls.updateRoundSlider(0, 0);

    // Sort players by id for consistent ordering
    const players = [...this.state.players].sort((a, b) => a.id - b.id);

    this.engine = new MultiPlayerIterationEngine({
      onRoundStart: (round, total) => {
        this.codeEditor.showProgress(`Round ${round + 1}/${total} — calling LLMs...`);
        this.replayControls.showStatus(
          `<span class="spinner"></span> Round ${round + 1}/${total}`,
          'info'
        );
      },
      onRoundComplete: (result: RoundResult) => {
        this.state.roundResults.push(result);
        const roundIdx = this.state.roundResults.length - 1;

        // Update progress
        const scoreStr = players.map(p => {
          const pd = result.players.find(pd => pd.playerId === p.id);
          return `P${p.id + 1}:${pd?.score ?? 0}`;
        }).join(' ');
        this.codeEditor.showProgress(
          `Round ${roundIdx + 1}/${TOTAL_ROUNDS} done | ${scoreStr}`
        );

        // Update round slider to latest
        this.replayControls.updateRoundSlider(this.state.roundResults.length, roundIdx);
        this.codeEditor.setRounds(this.state.roundResults.length);
        this.codeEditor.selectRound(roundIdx);

        // Update chart
        this.replayControls.renderScoreChart(this.state.roundResults, players);

        // Show first frame of latest round
        this.selectRound(roundIdx);

        // Show code for first player of this round
        this.selectPlayerCode(this.state.selectedPlayerId, roundIdx);

        // Update results
        this.replayControls.renderPlayerStats(players, result);
      },
      onAllComplete: (results) => {
        this.state.benchmarkRunning = false;
        this.codeEditor.setRunning(false);

        if (results.length === 0) {
          this.replayControls.showStatus('Benchmark stopped with no results.', 'info');
          return;
        }

        // Find best round per player
        const summary = players.map(p => {
          let bestScore = -1;
          let bestRound = 0;
          for (const rr of results) {
            const pd = rr.players.find(pd => pd.playerId === p.id);
            if (pd && pd.score > bestScore) {
              bestScore = pd.score;
              bestRound = rr.round;
            }
          }
          return `P${p.id + 1}(${p.label}): best ${bestScore} @ R${bestRound + 1}`;
        }).join(' | ');

        this.codeEditor.showProgress(`Done — ${results.length} rounds | ${summary}`);
        this.replayControls.showStatus(
          `Benchmark complete. ${results.length} rounds.`,
          'success'
        );
      },
      onError: (round, playerId, msg) => {
        this.replayControls.showStatus(
          `R${round + 1} P${playerId + 1} error: ${msg}`,
          'error'
        );
      },
      onPlayerLLMStart: () => {},
      onPlayerLLMComplete: () => {},
    });

    await this.engine.run(this.state.config, players);
  }

  private stopBenchmark(): void {
    if (this.engine) {
      this.engine.stop();
      this.state.benchmarkRunning = false;
      this.codeEditor.setRunning(false);
      this.replayControls.showStatus('Benchmark stopped by user.', 'info');
    }
  }

  // ====== Round / Code Selection ======
  private selectRound(round: number): void {
    if (round < 0 || round >= this.state.roundResults.length) return;

    this.state.selectedRound = round;
    const roundResult = this.state.roundResults[round];

    // Load this round's ticks for replay
    this.state.replayTicks = roundResult.ticks;
    this.state.replayIndex = 0;
    this.stopReplay();
    this.renderer.clearTrails();

    // Create simulation for arena reference (suns)
    this.simulation = new Simulation(this.state.config);

    // Show first frame
    if (roundResult.ticks.length > 0) {
      this.renderer.renderFrame(roundResult.ticks[0], this.simulation.arena.suns);
      this.replayControls.updateStats(0, roundResult.ticks[0].scores, '-');
    }

    // Update results panel
    const players = [...this.state.players].sort((a, b) => a.id - b.id);
    this.replayControls.renderPlayerStats(players, roundResult);
    this.replayControls.updateRoundSlider(this.state.roundResults.length, round);
  }

  private selectPlayerCode(playerId: number, round: number): void {
    this.state.selectedPlayerId = playerId;
    this.state.selectedRound = round;

    if (round < 0 || round >= this.state.roundResults.length) {
      this.codeEditor.setCode('');
      return;
    }

    const roundResult = this.state.roundResults[round];
    const pd = roundResult.players.find(p => p.playerId === playerId);
    this.codeEditor.setCode(pd?.code || '// No code for this player/round');
  }

  // ====== Replay ======
  private playReplay(): void {
    if (this.state.replayTicks.length === 0) {
      this.replayControls.showStatus('No replay data. Run a benchmark first.', 'error');
      return;
    }

    this.stopReplay();
    this.state.replayIndex = 0;
    this.state.replayPlaying = true;
    this.renderer.clearTrails();
    this.lastFrameTime = performance.now();

    if (!this.simulation) {
      this.simulation = new Simulation(this.state.config);
    }

    const animate = (now: number): void => {
      if (!this.state.replayPlaying) return;

      const elapsed = now - this.lastFrameTime;
      const msPerTick = 50 / this.state.replaySpeed;

      if (elapsed >= msPerTick) {
        this.lastFrameTime = now;

        if (this.state.replayIndex < this.state.replayTicks.length) {
          const tick = this.state.replayTicks[this.state.replayIndex];
          this.renderer.renderFrame(tick, this.simulation!.arena.suns);
          this.replayControls.updateStats(tick.tick, tick.scores, '-');
          this.state.replayIndex++;
        } else {
          this.state.replayPlaying = false;
          const lastTick = this.state.replayTicks[this.state.replayTicks.length - 1];
          const maxScore = Math.max(...lastTick.scores);
          const winnerIdx = lastTick.scores.indexOf(maxScore);
          this.replayControls.updateStats(
            this.state.config.totalTicks,
            lastTick.scores,
            `P${winnerIdx + 1}`
          );
          this.replayControls.showStatus('Replay complete.', 'info');
          return;
        }
      }

      this.replayAnimId = requestAnimationFrame(animate);
    };

    this.replayAnimId = requestAnimationFrame(animate);
    this.replayControls.showStatus('Playing replay...', 'info');
  }

  private stopReplay(): void {
    this.state.replayPlaying = false;
    if (this.replayAnimId) {
      cancelAnimationFrame(this.replayAnimId);
      this.replayAnimId = 0;
    }
  }

  // ====== Helpers ======
  private renderCurrentState(): void {
    if (!this.simulation) return;
    if (this.state.replayTicks.length > 0 && this.state.replayIndex > 0) {
      const idx = Math.min(this.state.replayIndex - 1, this.state.replayTicks.length - 1);
      this.renderer.renderFrame(this.state.replayTicks[idx], this.simulation.arena.suns);
    } else {
      const zone = this.simulation.getZone();
      this.renderer.renderInitial(this.simulation.arena.suns, zone);
    }
  }
}

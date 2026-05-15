import type { SimulationResult } from '../../types';
import type { AppState, LlmMaterialsRecord, Tab } from '../app';
import { Simulation } from '../../core/simulation';
import { GameRenderer } from '../../renderer/game-renderer';
import { callLLM } from '../../llm/api';
import { buildPrompt } from '../../llm/prompt-builder';
import { parseDecideCode } from '../../llm/code-parser';
import { createDecideFunction, BASELINE_ZONE_SEEKER_CODE } from '../../llm/sandbox';
import { generateDiagnostic } from '../../llm/diagnostic';
import { IterationEngine, type IterationRecord } from '../../llm/iteration-engine';
import { ApiConfig } from '../components/api-config';
import { CodeEditor } from '../components/code-editor';
import { IterationPanel } from '../components/iteration-panel';
import { ReplayControls } from '../components/replay-controls';

export class SimulatorTab implements Tab {
  el: HTMLElement;
  private state: AppState;
  private renderer!: GameRenderer;
  private simulation: Simulation | null = null;
  private iterationEngine: IterationEngine | null = null;

  // Replay internals
  private replayAnimId = 0;
  private lastFrameTime = 0;

  // Components
  private apiConfig!: ApiConfig;
  private codeEditor!: CodeEditor;
  private iterationPanel!: IterationPanel;
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

    // API Config
    this.apiConfig = new ApiConfig(rightPanel, {
      onStatusMessage: (html, type) => this.replayControls.showStatus(html, type),
    });

    // Game Config
    const gameConfigEl = document.createElement('div');
    gameConfigEl.className = 'panel-section';
    gameConfigEl.innerHTML = `
      <div class="panel-section-title">Game Configuration</div>
      <div class="field-row">
        <label class="field-label">SEED</label>
        <input type="number" class="field-input" id="seed-input" value="${this.state.config.seed}">
      </div>
      <div class="field-row">
        <label class="field-label">MODE</label>
        <select class="field-input" id="mode-select">
          <option value="single">Single-player fixed seed</option>
        </select>
      </div>
    `;
    rightPanel.appendChild(gameConfigEl);

    gameConfigEl.querySelector('#seed-input')!.addEventListener('change', () => {
      const seed = parseInt((gameConfigEl.querySelector('#seed-input') as HTMLInputElement).value) || 9001;
      this.state.config = { ...this.state.config, seed };
      this.initializeSimulation();
    });

    // Code Editor
    this.codeEditor = new CodeEditor(rightPanel, {
      onGenerate: () => this.generateBot(),
      onLoadBaseline: () => this.loadBaseline(),
      onApplyEdit: () => this.loadCodeFromEditor(),
    });

    // Iteration Panel (inside code editor section)
    this.iterationPanel = new IterationPanel(
      rightPanel.querySelector('.bot-code-container')! as HTMLElement,
      {
        onIterate: () => this.startIteration(),
        onStop: () => this.stopIteration(),
      }
    );
    // Move iteration panel before the textarea
    const botCodeContainer = rightPanel.querySelector('.bot-code-container')!;
    const textarea = botCodeContainer.querySelector('.bot-code')!;
    const iterationEl = this.iterationPanel['el'];
    botCodeContainer.insertBefore(iterationEl, textarea);

    // Replay Controls
    this.replayControls = new ReplayControls(rightPanel, this.state, {
      onRun: () => this.runScoreTrial(),
      onPlay: () => this.playReplay(),
      onStop: () => this.stopReplay(),
      onCopyReport: () => this.copyTrialReport(),
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
  }

  onDeactivate(): void {
    this.stopReplay();
  }

  // ====== Simulation ======
  private initializeSimulation(): void {
    this.simulation = new Simulation(this.state.config);
    this.state.simulationResult = null;
    this.state.replayTicks = [];
    this.state.replayIndex = 0;
    this.renderer.clearTrails();
    this.replayControls.updateStats(0, [0], '-');
    this.el.querySelector('#stat-seed')!.textContent = String(this.state.config.seed);

    const zone = this.simulation.getZone();
    this.renderer.renderInitial(this.simulation.arena.suns, zone);
    this.replayControls.renderPlayerStats(null);
  }

  // ====== Generate Bot ======
  private async generateBot(): Promise<void> {
    const apiKey = this.apiConfig.getApiKey();
    const provider = this.apiConfig.getProvider();
    const model = this.apiConfig.getModel();

    if (!apiKey) { this.replayControls.showStatus('Please enter an API key first.', 'error'); return; }
    if (!model) { this.replayControls.showStatus('Please enter a model name.', 'error'); return; }

    if (!this.simulation) this.initializeSimulation();

    this.replayControls.showStatus('<span class="spinner"></span> Generating bot code...', 'info');
    this.disableButtons(true);

    try {
      const { system, user } = buildPrompt(
        this.state.config,
        this.simulation!.arena.suns,
        this.simulation!.arena.shipStartPositions,
        0
      );

      const response = await callLLM(apiKey, provider, model, system, user);
      const code = parseDecideCode(response.content);

      this.state.currentBotCode = code;
      this.state.currentDecide = createDecideFunction(code);
      this.codeEditor.setCode(code);

      // Store LLM materials
      this.state.llmMaterials = [{
        round: 1,
        type: 'generate',
        systemPrompt: system,
        userPrompt: user,
        rawResponse: response.content,
        extractedCode: code,
        diagnostic: null,
        tokensUsed: { input: response.usage.inputTokens, output: response.usage.outputTokens },
      }];

      this.replayControls.showStatus(
        `Bot generated. Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out.`,
        'success'
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.replayControls.showStatus(`Error: ${msg}`, 'error');
    } finally {
      this.disableButtons(false);
    }
  }

  // ====== Iterative Learning ======
  private async startIteration(): Promise<void> {
    const apiKey = this.apiConfig.getApiKey();
    const provider = this.apiConfig.getProvider();
    const model = this.apiConfig.getModel();
    const maxRounds = this.iterationPanel.getRounds();

    if (!apiKey) { this.replayControls.showStatus('Please enter an API key first.', 'error'); return; }
    if (!model) { this.replayControls.showStatus('Please enter a model name.', 'error'); return; }

    if (!this.simulation) this.initializeSimulation();

    this.state.iterationRunning = true;
    this.state.iterationRecords = [];
    this.state.llmMaterials = [];
    this.disableButtons(true);
    this.iterationPanel.setRunning(true);
    this.iterationPanel.showProgress('Starting...');

    const scoreHistory: number[] = [];

    this.iterationEngine = new IterationEngine(
      { maxRounds, noImprovementRounds: 3 },
      {
        onRoundStart: (round, total) => {
          this.replayControls.showStatus(`<span class="spinner"></span> Round ${round}/${total} — calling LLM...`, 'info');
          this.iterationPanel.showProgress(
            `Round ${round}/${total}  |  ${scoreHistory.join(' → ')}${scoreHistory.length ? ' → ...' : '...'}`
          );
        },
        onRoundComplete: (record: IterationRecord) => {
          scoreHistory.push(record.score);
          this.iterationPanel.showProgress(`Round ${record.round}/${maxRounds}  |  ${scoreHistory.join(' → ')}`);

          // Store LLM materials
          this.state.llmMaterials.push({
            round: record.round,
            type: 'iterate',
            systemPrompt: record.systemPrompt,
            userPrompt: record.userPrompt,
            rawResponse: record.rawResponse,
            extractedCode: record.code,
            diagnostic: record.diagnostic,
            tokensUsed: record.tokensUsed,
          });

          // Load best code into editor
          const best = this.state.iterationRecords.length > 0
            ? this.state.iterationRecords.reduce((b, r) => r.score > b.score ? r : b)
            : null;
          if (!best || record.score >= (best?.score ?? -1)) {
            this.state.currentBotCode = record.code;
            this.state.currentDecide = createDecideFunction(record.code);
            this.codeEditor.setCode(record.code);
          }
          this.state.iterationRecords.push(record);
        },
        onIterationDone: (records, bestRound) => {
          this.state.iterationRunning = false;
          this.disableButtons(false);
          this.iterationPanel.setRunning(false);

          if (records.length === 0) {
            this.replayControls.showStatus('Iteration stopped with no results.', 'info');
            return;
          }

          const best = records.reduce((b, r) => r.score > b.score ? r : b);
          this.state.currentBotCode = best.code;
          this.state.currentDecide = createDecideFunction(best.code);
          this.codeEditor.setCode(best.code);

          const totalTokens = records.reduce((s, r) => s + r.tokensUsed.input + r.tokensUsed.output, 0);
          this.replayControls.showStatus(
            `Iteration complete. Best score: ${best.score} (round ${bestRound}). Scores: ${records.map(r => r.score).join(' → ')}. Tokens: ${totalTokens}.`,
            'success'
          );
          this.iterationPanel.showProgress(
            `Done — ${records.length} rounds  |  ${records.map(r => r.score).join(' → ')}  |  Best: ${best.score} (R${bestRound})`
          );
        },
        onError: (round, msg) => {
          this.state.iterationRunning = false;
          this.disableButtons(false);
          this.iterationPanel.setRunning(false);
          this.replayControls.showStatus(`Iteration error at round ${round}: ${msg}`, 'error');
        },
      }
    );

    await this.iterationEngine.run(this.state.config, provider, apiKey, model);
  }

  private stopIteration(): void {
    if (this.iterationEngine) {
      this.iterationEngine.stop();
      this.state.iterationRunning = false;
      this.disableButtons(false);
      this.iterationPanel.setRunning(false);
      this.replayControls.showStatus('Iteration stopped by user.', 'info');
    }
  }

  // ====== Run Simulation ======
  private runScoreTrial(): void {
    if (!this.state.currentDecide) {
      this.replayControls.showStatus('No bot loaded. Generate a bot or load baseline first.', 'error');
      return;
    }

    this.simulation = new Simulation(this.state.config);
    this.renderer.clearTrails();
    this.replayControls.showStatus('<span class="spinner"></span> Running simulation...', 'info');

    const result = this.simulation.runToCompletion([this.state.currentDecide]);
    this.state.simulationResult = result;
    this.state.replayTicks = result.ticks;
    this.state.replayIndex = 0;

    this.state.diagnostic = generateDiagnostic(result, this.state.config);

    const winner = this.state.config.playerCount === 1
      ? 'P1'
      : `P${result.finalScores.indexOf(Math.max(...result.finalScores)) + 1}`;
    this.replayControls.updateStats(this.state.config.totalTicks, result.finalScores, winner);
    this.replayControls.renderPlayerStats(result);

    this.replayControls.showStatus(
      `Run complete. Score: ${result.finalScores[0]}. Click PLAY REPLAY to watch.`,
      'success'
    );

    // Show final frame with trails
    this.renderFinalFrame(result);
  }

  private renderFinalFrame(result: SimulationResult): void {
    if (result.ticks.length === 0) return;
    this.renderer.clearTrails();
    for (let i = 0; i < result.ticks.length; i++) {
      for (const shipData of result.ticks[i].ships) {
        if (!shipData.alive) continue;
        if (!this.renderer.trails[shipData.id]) this.renderer.trails[shipData.id] = [];
        const { cx, cy } = this.renderer.gameToCanvas(shipData.x, shipData.y);
        this.renderer.trails[shipData.id].push({ x: cx, y: cy });
        if (this.renderer.trails[shipData.id].length > 100) {
          this.renderer.trails[shipData.id].shift();
        }
      }
    }
    this.renderer.renderFrame(result.ticks[result.ticks.length - 1], this.simulation!.arena.suns);
  }

  // ====== Replay ======
  private playReplay(): void {
    if (this.state.replayTicks.length === 0) {
      this.replayControls.showStatus('No replay data. Run a simulation first.', 'error');
      return;
    }

    this.stopReplay();
    this.state.replayIndex = 0;
    this.state.replayPlaying = true;
    this.renderer.clearTrails();
    this.lastFrameTime = performance.now();

    const animate = (now: number): void => {
      if (!this.state.replayPlaying) return;

      const elapsed = now - this.lastFrameTime;
      const msPerTick = 50 / this.state.replaySpeed;

      if (elapsed >= msPerTick) {
        this.lastFrameTime = now;

        if (this.state.replayIndex < this.state.replayTicks.length) {
          this.renderer.renderFrame(this.state.replayTicks[this.state.replayIndex], this.simulation!.arena.suns);
          this.replayControls.updateStats(
            this.state.replayTicks[this.state.replayIndex].tick,
            this.state.replayTicks[this.state.replayIndex].scores,
            '-'
          );
          this.state.replayIndex++;
        } else {
          this.state.replayPlaying = false;
          if (this.state.simulationResult) {
            const winner = this.state.config.playerCount === 1
              ? 'P1'
              : `P${this.state.simulationResult.finalScores.indexOf(Math.max(...this.state.simulationResult.finalScores)) + 1}`;
            this.replayControls.updateStats(this.state.config.totalTicks, this.state.simulationResult.finalScores, winner);
          }
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

  // ====== Baseline & Code Loading ======
  private loadBaseline(): void {
    this.state.currentBotCode = BASELINE_ZONE_SEEKER_CODE;
    this.state.currentDecide = createDecideFunction(BASELINE_ZONE_SEEKER_CODE);
    this.codeEditor.setCode(BASELINE_ZONE_SEEKER_CODE);
    this.replayControls.showStatus('Baseline zone seeker bot loaded.', 'success');
  }

  private loadCodeFromEditor(): void {
    const code = this.codeEditor.getCode();
    if (!code.trim()) {
      this.replayControls.showStatus('Bot code is empty.', 'error');
      return;
    }
    try {
      this.state.currentBotCode = code;
      this.state.currentDecide = createDecideFunction(code);
      this.replayControls.showStatus('Bot code loaded from editor.', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.replayControls.showStatus(`Failed to parse code: ${msg}`, 'error');
    }
  }

  private copyTrialReport(): void {
    if (!this.state.diagnostic) {
      this.replayControls.showStatus('No trial report available. Run a simulation first.', 'error');
      return;
    }
    const text = JSON.stringify(this.state.diagnostic, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      this.replayControls.showStatus('Trial report copied to clipboard.', 'success');
    });
  }

  // ====== Helpers ======
  private disableButtons(disabled: boolean): void {
    this.codeEditor.setGenerateDisabled(disabled);
    this.iterationPanel.setIterateDisabled(disabled);
    this.replayControls.setRunDisabled(disabled);
    this.replayControls.setPlayDisabled(disabled);
  }

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

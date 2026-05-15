import type { DecideFunction, GameConfig, SimulationResult, TickRecord } from './types';
import { DEFAULT_CONFIG, PLAYER_COLORS } from './constants';
import { Simulation } from './core/simulation';
import { GameRenderer } from './renderer/game-renderer';
import { callLLM, type ApiProvider } from './llm/api';
import { buildPrompt } from './llm/prompt-builder';
import { parseDecideCode } from './llm/code-parser';
import { createDecideFunction, BASELINE_ZONE_SEEKER_CODE } from './llm/sandbox';
import { generateDiagnostic, type DiagnosticReport } from './llm/diagnostic';
import { getZoneRadius } from './core/zone';

// ====== App State ======
let config: GameConfig = { ...DEFAULT_CONFIG };
let simulation: Simulation | null = null;
let simulationResult: SimulationResult | null = null;
let currentBotCode = '';
let currentDecide: DecideFunction | null = null;
let diagnostic: DiagnosticReport | null = null;

// Replay state
let replayTicks: TickRecord[] = [];
let replayIndex = 0;
let replayPlaying = false;
let replaySpeed = 1;
let replayAnimId = 0;
let lastFrameTime = 0;

let renderer: GameRenderer;

// ====== DOM Setup ======
function createApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="simulator">SIMULATOR</button>
      <button class="tab-btn" data-tab="llm-materials">LLM MATERIALS</button>
      <button class="tab-btn" data-tab="database">DATABASE</button>
      <button class="tab-btn" data-tab="full-runs">FULL RUNS</button>
      <button class="tab-btn" data-tab="leaderboard">LEADERBOARD</button>
      <button class="tab-btn" data-tab="pvp">PVP</button>
    </div>

    <div class="tab-content active" id="tab-simulator">
      <div class="simulator-layout">
        <div class="simulator-left">
          <div class="simulator-header">
            <div class="game-title">GRAVWELL GPT</div>
            <div class="game-stats">
              <div><span class="stat-label">SEED</span><br><span class="stat-value" id="stat-seed">${config.seed}</span></div>
              <div><span class="stat-label">TICK</span><br><span class="stat-value" id="stat-tick">0 / ${config.totalTicks}</span></div>
              <div><span class="stat-label">SCORE</span><br><span class="stat-value" id="stat-score">0</span></div>
              <div><span class="stat-label">WINNER</span><br><span class="stat-value" id="stat-winner">-</span></div>
            </div>
          </div>
          <div class="canvas-container">
            <canvas id="game-canvas"></canvas>
          </div>
        </div>

        <div class="simulator-right">
          <!-- API Configuration Section -->
          <div class="panel-section">
            <div class="panel-section-title">API Configuration</div>
            <div class="field-row">
              <label class="field-label">PROVIDER</label>
              <select class="field-input" id="api-provider">
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
            <div class="field-row">
              <label class="field-label">API KEY</label>
              <input type="password" class="field-input" id="api-key" placeholder="sk-or-... or sk-ant-...">
            </div>
            <div class="field-row">
              <label class="field-label">MODEL</label>
              <input type="text" class="field-input" id="model-input" placeholder="e.g. deepseek-chat">
            </div>
            <div class="btn-row">
              <button class="btn btn-sm" id="btn-save-key">SAVE</button>
              <button class="btn btn-sm btn-outline" id="btn-clear-key">CLEAR</button>
            </div>
          </div>

          <!-- Game Config Section -->
          <div class="panel-section">
            <div class="panel-section-title">Game Configuration</div>
            <div class="field-row">
              <label class="field-label">SEED</label>
              <input type="number" class="field-input" id="seed-input" value="${config.seed}">
            </div>
            <div class="field-row">
              <label class="field-label">MODE</label>
              <select class="field-input" id="mode-select">
                <option value="single">Single-player fixed seed</option>
              </select>
            </div>
          </div>

          <!-- Bot Code -->
          <div class="panel-section bot-code-container">
            <div class="panel-section-title">BOT CODE</div>
            <div class="btn-row" style="margin-top: 0; margin-bottom: 6px;">
              <button class="btn btn-sm" id="btn-generate">GENERATE BOT</button>
              <button class="btn btn-sm btn-outline" id="btn-load-baseline">LOAD BASELINE</button>
              <button class="btn btn-sm btn-outline" id="btn-load-code">APPLY EDIT</button>
            </div>
            <textarea class="bot-code" id="bot-code" spellcheck="false" placeholder="// Bot code will appear here after generation..."></textarea>
          </div>

          <!-- Run & Replay -->
          <div class="panel-section">
            <div class="btn-row">
              <button class="btn" id="btn-run">RUN TRIAL</button>
              <button class="btn btn-outline" id="btn-play">PLAY</button>
              <button class="btn btn-outline" id="btn-stop">STOP</button>
            </div>
            <div class="replay-controls" style="margin-top: 8px;">
              <input type="range" class="speed-slider" id="speed-slider" min="0.25" max="5" step="0.25" value="1">
              <span class="speed-label" id="speed-label">1.0x</span>
            </div>
            <div id="status-area" style="margin-top: 8px;"></div>
          </div>

          <!-- Results -->
          <div class="panel-section" id="player-stats-section">
            <div class="panel-section-title">Results</div>
            <div id="player-stats"></div>
            <div class="btn-row" style="margin-top: 6px;">
              <button class="btn btn-sm btn-outline" id="btn-copy-report">COPY REPORT</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-content" id="tab-llm-materials">
      <div style="padding: 20px; color: var(--text-dim);">LLM Materials tab - coming in Phase 5</div>
    </div>
    <div class="tab-content" id="tab-database">
      <div style="padding: 20px; color: var(--text-dim);">Database tab - coming in Phase 6</div>
    </div>
    <div class="tab-content" id="tab-full-runs">
      <div style="padding: 20px; color: var(--text-dim);">Full Runs tab - coming in Phase 5</div>
    </div>
    <div class="tab-content" id="tab-leaderboard">
      <div style="padding: 20px; color: var(--text-dim);">Leaderboard tab - coming in Phase 6</div>
    </div>
    <div class="tab-content" id="tab-pvp">
      <div style="padding: 20px; color: var(--text-dim);">PVP tab - coming in Phase 6</div>
    </div>
  `;

  setupTabs();
  setupCanvas();
  setupEventListeners();
  loadSavedSettings();
  initializeSimulation();
}

// ====== Tab Navigation ======
function setupTabs(): void {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tabId = `tab-${btn.getAttribute('data-tab')}`;
      document.getElementById(tabId)?.classList.add('active');
    });
  });
}

// ====== Canvas Setup ======
function setupCanvas(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = new GameRenderer(canvas);
  renderer.resize();

  window.addEventListener('resize', () => {
    renderer.resize();
    renderCurrentState();
  });
}

// ====== Event Listeners ======
function setupEventListeners(): void {
  // API Key
  document.getElementById('btn-save-key')!.addEventListener('click', saveApiKey);
  document.getElementById('btn-clear-key')!.addEventListener('click', clearApiKey);

  // Seed change
  document.getElementById('seed-input')!.addEventListener('change', () => {
    const seed = parseInt((document.getElementById('seed-input') as HTMLInputElement).value) || 9001;
    config = { ...config, seed };
    initializeSimulation();
  });

  // Actions
  document.getElementById('btn-generate')!.addEventListener('click', generateBot);
  document.getElementById('btn-run')!.addEventListener('click', runScoreTrial);
  document.getElementById('btn-play')!.addEventListener('click', playReplay);
  document.getElementById('btn-stop')!.addEventListener('click', stopReplay);
  document.getElementById('btn-copy-report')!.addEventListener('click', copyTrialReport);
  document.getElementById('btn-load-baseline')!.addEventListener('click', loadBaseline);
  document.getElementById('btn-load-code')!.addEventListener('click', loadCodeFromEditor);

  // Replay speed
  const slider = document.getElementById('speed-slider') as HTMLInputElement;
  slider.addEventListener('input', () => {
    replaySpeed = parseFloat(slider.value);
    document.getElementById('speed-label')!.textContent = `${replaySpeed.toFixed(1)}x`;
  });
}

// ====== Settings ======
function saveApiKey(): void {
  const key = (document.getElementById('api-key') as HTMLInputElement).value;
  const provider = (document.getElementById('api-provider') as HTMLSelectElement).value;
  const model = (document.getElementById('model-input') as HTMLInputElement).value;
  localStorage.setItem('gravwell-api-key', key);
  localStorage.setItem('gravwell-api-provider', provider);
  localStorage.setItem('gravwell-api-model', model);
  showStatus('API key saved.', 'success');
}

function clearApiKey(): void {
  localStorage.removeItem('gravwell-api-key');
  localStorage.removeItem('gravwell-api-provider');
  localStorage.removeItem('gravwell-api-model');
  (document.getElementById('api-key') as HTMLInputElement).value = '';
  (document.getElementById('model-input') as HTMLInputElement).value = '';
  showStatus('API key cleared.', 'info');
}

function loadSavedSettings(): void {
  const key = localStorage.getItem('gravwell-api-key') || '';
  const provider = localStorage.getItem('gravwell-api-provider') || 'openrouter';
  const model = localStorage.getItem('gravwell-api-model') || '';
  (document.getElementById('api-key') as HTMLInputElement).value = key;
  (document.getElementById('api-provider') as HTMLSelectElement).value = provider;
  (document.getElementById('model-input') as HTMLInputElement).value = model;
}

// ====== Simulation ======
function initializeSimulation(): void {
  simulation = new Simulation(config);
  simulationResult = null;
  replayTicks = [];
  replayIndex = 0;
  renderer.clearTrails();
  updateStats(0, [0], '-');
  document.getElementById('stat-seed')!.textContent = String(config.seed);

  // Render initial arena state
  const zone = simulation.getZone();
  renderer.renderInitial(simulation.arena.suns, zone);
  updatePlayerStats(null);
}

function updateStats(tick: number, scores: number[], winner: string): void {
  document.getElementById('stat-tick')!.textContent = `${tick} / ${config.totalTicks}`;
  document.getElementById('stat-score')!.textContent = scores.length === 1 ? `P1 ${scores[0]}` : scores.map((s, i) => `P${i+1} ${s}`).join(' ');
  document.getElementById('stat-winner')!.textContent = winner;
}

function updatePlayerStats(result: SimulationResult | null): void {
  const container = document.getElementById('player-stats')!;
  if (!result) {
    container.innerHTML = `<div class="player-stat">
      <div class="player-dot" style="background: ${PLAYER_COLORS[0]}"></div>
      <span class="player-name">P1</span>
      <span class="player-detail">Ready</span>
      <span class="player-score">0</span>
    </div>`;
    return;
  }

  const html = [];
  for (let p = 0; p < config.playerCount; p++) {
    const score = result.finalScores[p];
    const ships = result.shipStats.filter(s => s.id.startsWith(`P${p + 1}`));
    const alive = ships.filter(s => s.alive).length;
    const crashed = ships.filter(s => !s.alive).length;
    const fuelLeft = ships.reduce((sum, s) => sum + s.fuelRemaining, 0).toFixed(1);

    html.push(`<div class="player-stat">
      <div class="player-dot" style="background: ${PLAYER_COLORS[p]}"></div>
      <span class="player-name">P${p + 1}</span>
      <span class="player-detail">${alive} alive | ${crashed} crashed | fuel ${fuelLeft}</span>
      <span class="player-score">${score}</span>
    </div>`);
  }

  container.innerHTML = html.join('');
}

// ====== Generate Bot ======
async function generateBot(): Promise<void> {
  const apiKey = (document.getElementById('api-key') as HTMLInputElement).value;
  const provider = (document.getElementById('api-provider') as HTMLSelectElement).value as ApiProvider;
  const model = (document.getElementById('model-input') as HTMLInputElement).value;

  if (!apiKey) {
    showStatus('Please enter an API key first.', 'error');
    return;
  }
  if (!model) {
    showStatus('Please enter a model name.', 'error');
    return;
  }

  if (!simulation) initializeSimulation();

  showStatus('<span class="spinner"></span> Generating bot code...', 'info');
  disableButtons(true);

  try {
    const { system, user } = buildPrompt(
      config,
      simulation!.arena.suns,
      simulation!.arena.shipStartPositions,
      0 // player index 0
    );

    const response = await callLLM(apiKey, provider, model, system, user);
    const code = parseDecideCode(response.content);

    currentBotCode = code;
    currentDecide = createDecideFunction(code);
    (document.getElementById('bot-code') as HTMLTextAreaElement).value = code;

    showStatus(
      `Bot generated. Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out.`,
      'success'
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showStatus(`Error: ${msg}`, 'error');
  } finally {
    disableButtons(false);
  }
}

// ====== Run Simulation ======
function runScoreTrial(): void {
  if (!currentDecide) {
    showStatus('No bot loaded. Generate a bot or load baseline first.', 'error');
    return;
  }

  simulation = new Simulation(config);
  renderer.clearTrails();

  showStatus('<span class="spinner"></span> Running simulation...', 'info');

  // Run simulation (synchronous, 200 ticks is fast)
  simulationResult = simulation.runToCompletion([currentDecide]);
  replayTicks = simulationResult.ticks;
  replayIndex = 0;

  diagnostic = generateDiagnostic(simulationResult, config);

  // Update UI
  const winner = config.playerCount === 1 ? 'P1' : `P${simulationResult.finalScores.indexOf(Math.max(...simulationResult.finalScores)) + 1}`;
  updateStats(config.totalTicks, simulationResult.finalScores, winner);
  updatePlayerStats(simulationResult);

  showStatus(
    `Run complete. Score: ${simulationResult.finalScores[0]}. Click PLAY REPLAY to watch.`,
    'success'
  );

  // Show final frame
  if (replayTicks.length > 0) {
    renderer.clearTrails();
    // Quick render all frames to build trails
    for (let i = 0; i < replayTicks.length; i++) {
      for (const shipData of replayTicks[i].ships) {
        if (!shipData.alive) continue;
        if (!renderer.trails[shipData.id]) renderer.trails[shipData.id] = [];
        const { cx, cy } = renderer.gameToCanvas(shipData.x, shipData.y);
        renderer.trails[shipData.id].push({ x: cx, y: cy });
        if (renderer.trails[shipData.id].length > 100) {
          renderer.trails[shipData.id].shift();
        }
      }
    }
    renderer.renderFrame(replayTicks[replayTicks.length - 1], simulation.arena.suns);
  }
}

// ====== Replay ======
function playReplay(): void {
  if (replayTicks.length === 0) {
    showStatus('No replay data. Run a simulation first.', 'error');
    return;
  }

  stopReplay();
  replayIndex = 0;
  replayPlaying = true;
  renderer.clearTrails();
  lastFrameTime = performance.now();

  function animate(now: number): void {
    if (!replayPlaying) return;

    const elapsed = now - lastFrameTime;
    const msPerTick = 50 / replaySpeed; // base: 50ms per tick at 1x

    if (elapsed >= msPerTick) {
      lastFrameTime = now;

      if (replayIndex < replayTicks.length) {
        renderer.renderFrame(replayTicks[replayIndex], simulation!.arena.suns);
        updateStats(
          replayTicks[replayIndex].tick,
          replayTicks[replayIndex].scores,
          '-'
        );
        replayIndex++;
      } else {
        // Replay finished
        replayPlaying = false;
        if (simulationResult) {
          const winner = config.playerCount === 1 ? 'P1' : `P${simulationResult.finalScores.indexOf(Math.max(...simulationResult.finalScores)) + 1}`;
          updateStats(config.totalTicks, simulationResult.finalScores, winner);
        }
        showStatus('Replay complete.', 'info');
        return;
      }
    }

    replayAnimId = requestAnimationFrame(animate);
  }

  replayAnimId = requestAnimationFrame(animate);
  showStatus('Playing replay...', 'info');
}

function stopReplay(): void {
  replayPlaying = false;
  if (replayAnimId) {
    cancelAnimationFrame(replayAnimId);
    replayAnimId = 0;
  }
}

// ====== Baseline & Code Loading ======
function loadBaseline(): void {
  currentBotCode = BASELINE_ZONE_SEEKER_CODE;
  currentDecide = createDecideFunction(BASELINE_ZONE_SEEKER_CODE);
  (document.getElementById('bot-code') as HTMLTextAreaElement).value = BASELINE_ZONE_SEEKER_CODE;
  showStatus('Baseline zone seeker bot loaded.', 'success');
}

function loadCodeFromEditor(): void {
  const code = (document.getElementById('bot-code') as HTMLTextAreaElement).value;
  if (!code.trim()) {
    showStatus('Bot code is empty.', 'error');
    return;
  }
  try {
    currentBotCode = code;
    currentDecide = createDecideFunction(code);
    showStatus('Bot code loaded from editor.', 'success');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showStatus(`Failed to parse code: ${msg}`, 'error');
  }
}

function copyTrialReport(): void {
  if (!diagnostic) {
    showStatus('No trial report available. Run a simulation first.', 'error');
    return;
  }
  const text = JSON.stringify(diagnostic, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    showStatus('Trial report copied to clipboard.', 'success');
  });
}

// ====== Helpers ======
function showStatus(html: string, type: 'info' | 'error' | 'success'): void {
  const area = document.getElementById('status-area')!;
  area.innerHTML = `<div class="status-msg ${type}">${html}</div>`;
}

function disableButtons(disabled: boolean): void {
  const btns = ['btn-generate', 'btn-run', 'btn-play'];
  btns.forEach(id => {
    (document.getElementById(id) as HTMLButtonElement).disabled = disabled;
  });
}

function renderCurrentState(): void {
  if (!simulation) return;
  if (replayTicks.length > 0 && replayIndex > 0) {
    const idx = Math.min(replayIndex - 1, replayTicks.length - 1);
    renderer.renderFrame(replayTicks[idx], simulation.arena.suns);
  } else {
    const zone = simulation.getZone();
    renderer.renderInitial(simulation.arena.suns, zone);
  }
}

// ====== Bootstrap ======
createApp();

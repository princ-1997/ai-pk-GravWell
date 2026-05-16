import type { AppState, Tab } from '../app';
import type { ApiProvider, LeaderboardRunRecord } from '../../types';
import { LEADERBOARD_SEEDS } from '../../constants';
import { computeConfigHash, makeCacheKey } from '../../persistence/db';
import { getAllRuns, deleteAllRuns, getRunByCacheKey } from '../../persistence/leaderboard-store';
import {
  LeaderboardRunner,
  type LeaderboardModelEntry,
  type LeaderboardResult,
} from '../../modes/leaderboard-runner';

export class LeaderboardTab implements Tab {
  el: HTMLElement;
  private state: AppState;
  private runner: LeaderboardRunner | null = null;
  private running = false;

  // DOM refs
  private modelListEl!: HTMLElement;
  private runBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private clearBtn!: HTMLButtonElement;
  private rankingBody!: HTMLElement;
  private matrixWrap!: HTMLElement;
  private chartCanvas!: HTMLCanvasElement;
  private detailEl!: HTMLElement;

  // State
  private results: Map<string, LeaderboardResult> = new Map();
  private seedScores: Map<string, Map<number, { score: number; cached: boolean }>> = new Map();
  private activeCell: { model: string; seed: number } | null = null;

  // Track running state for UI
  private runningModel = '';
  private runningSeed = 0;
  private runningRound = 0;
  private runningTotalRounds = 0;

  constructor(state: AppState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'lb-tab-root';
    this.el.innerHTML = `
      <div class="lb-mode-bar">
        <button class="lb-mode-btn lb-mode-btn--active" data-mode="benchmark">BENCHMARK</button>
        <button class="lb-mode-btn" data-mode="elo">ELO</button>
      </div>

      <div id="lb-benchmark-view">
      <div class="leaderboard-layout">
        <div class="leaderboard-controls">
          <div class="panel-section">
            <div class="panel-section-title">MODEL SELECTION</div>
            <div id="lb-model-list" class="lb-model-list"></div>
            <div class="lb-select-btns">
              <button id="lb-sel-all">ALL</button>
              <button id="lb-sel-none">NONE</button>
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">RUN CONTROLS</div>
            <div class="btn-row">
              <button class="btn" id="lb-btn-run">RUN LEADERBOARD</button>
              <button class="btn btn-outline" id="lb-btn-stop" style="display:none;">STOP</button>
            </div>
            <div id="lb-status" class="lb-status"></div>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">CACHE</div>
            <button class="btn btn-outline" id="lb-btn-clear" style="font-size:10px;">CLEAR ALL CACHED DATA</button>
          </div>
        </div>

        <div class="leaderboard-results">
          <div class="panel-section">
            <div class="panel-section-title">RANKING</div>
            <table class="lb-ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th>Avg Score</th>
                  <th>Median</th>
                  <th>Std Dev</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Seeds</th>
                </tr>
              </thead>
              <tbody id="lb-ranking-body"></tbody>
            </table>
          </div>

          <div class="lb-matrix-section panel-section">
            <div class="panel-section-title">SEED SCORE MATRIX</div>
            <div class="lb-matrix-wrap" id="lb-matrix-wrap"></div>
          </div>

          <div class="lb-chart-section panel-section">
            <div class="panel-section-title">SCORE COMPARISON</div>
            <canvas id="lb-chart"></canvas>
          </div>

          <div id="lb-detail" class="lb-detail" style="display:none;"></div>
        </div>
      </div>
      </div>

      <div id="lb-elo-view" style="display:none;">
        <div class="lb-elo-placeholder">
          <div class="lb-elo-placeholder-title">ELO MODE</div>
          <div class="lb-elo-placeholder-body">
            Head-to-head bot battles with Elo ratings.<br>
            Coming in Phase 8.
          </div>
        </div>
      </div>
    `;

    this.modelListEl = this.el.querySelector('#lb-model-list')!;
    this.runBtn = this.el.querySelector('#lb-btn-run') as HTMLButtonElement;
    this.stopBtn = this.el.querySelector('#lb-btn-stop') as HTMLButtonElement;
    this.statusEl = this.el.querySelector('#lb-status')!;
    this.clearBtn = this.el.querySelector('#lb-btn-clear') as HTMLButtonElement;
    this.rankingBody = this.el.querySelector('#lb-ranking-body')!;
    this.matrixWrap = this.el.querySelector('#lb-matrix-wrap')!;
    this.chartCanvas = this.el.querySelector('#lb-chart') as HTMLCanvasElement;
    this.detailEl = this.el.querySelector('#lb-detail')!;

    this.runBtn.addEventListener('click', () => this.startLeaderboard());
    this.stopBtn.addEventListener('click', () => this.stopLeaderboard());
    this.clearBtn.addEventListener('click', () => this.clearCache());

    this.el.querySelector('#lb-sel-all')!.addEventListener('click', () => this.selectAll(true));
    this.el.querySelector('#lb-sel-none')!.addEventListener('click', () => this.selectAll(false));

    this.el.querySelectorAll<HTMLButtonElement>('.lb-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode!;
        this.el.querySelectorAll('.lb-mode-btn').forEach(b => b.classList.remove('lb-mode-btn--active'));
        btn.classList.add('lb-mode-btn--active');
        (this.el.querySelector('#lb-benchmark-view') as HTMLElement).style.display = mode === 'benchmark' ? '' : 'none';
        (this.el.querySelector('#lb-elo-view') as HTMLElement).style.display = mode === 'elo' ? '' : 'none';
      });
    });
  }

  async onActivate(): Promise<void> {
    this.renderModelList();
    await this.loadCachedResults();
  }

  onDeactivate(): void {}

  // ====== Model Selection ======

  private renderModelList(): void {
    const llmPlayers = this.state.players.filter(p => p.provider !== null);

    if (llmPlayers.length === 0) {
      this.modelListEl.innerHTML = `<div class="lb-no-models">No LLM players configured. Add players in the SIMULATOR tab first.</div>`;
      return;
    }

    this.modelListEl.innerHTML = llmPlayers.map(p => `
      <div class="lb-model-row">
        <input type="checkbox" id="lb-chk-${p.id}" data-player-id="${p.id}" checked>
        <label for="lb-chk-${p.id}" style="color: ${p.color};">${p.label || p.model}</label>
      </div>
    `).join('');
  }

  private selectAll(checked: boolean): void {
    this.modelListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach(cb => cb.checked = checked);
  }

  private getSelectedEntries(): LeaderboardModelEntry[] {
    const entries: LeaderboardModelEntry[] = [];
    this.modelListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')
      .forEach(cb => {
        const pid = parseInt(cb.dataset.playerId!);
        const player = this.state.players.find(p => p.id === pid);
        if (player?.provider) {
          entries.push({
            provider: player.provider,
            apiKey: player.apiKey,
            model: player.model,
          });
        }
      });
    return entries;
  }

  // ====== Cache Loading ======

  private async loadCachedResults(): Promise<void> {
    const cfgHash = computeConfigHash(this.state.config);
    const allRuns = await getAllRuns();

    // Group by model, filter by current config
    const byModel = new Map<string, LeaderboardRunRecord[]>();
    for (const run of allRuns) {
      if (run.configHash !== cfgHash) continue;
      let arr = byModel.get(run.model);
      if (!arr) { arr = []; byModel.set(run.model, arr); }
      arr.push(run);
    }

    // Build results and seedScores from cache
    this.results.clear();
    this.seedScores.clear();

    for (const [model, runs] of byModel) {
      const scoreMap = new Map<number, { score: number; cached: boolean }>();
      const scores: Array<{ seed: number; score: number }> = [];
      let totalInput = 0;
      let totalOutput = 0;
      let provider: ApiProvider = runs[0].provider;

      for (const run of runs) {
        scoreMap.set(run.seed, { score: run.finalScore, cached: true });
        scores.push({ seed: run.seed, score: run.finalScore });
        totalInput += run.totalTokens.input;
        totalOutput += run.totalTokens.output;
        provider = run.provider;
      }

      this.seedScores.set(model, scoreMap);

      if (scores.length > 0) {
        const vals = scores.map(s => s.score);
        const sorted = [...vals].sort((a, b) => a - b);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        const variance = vals.reduce((sum, s) => sum + (s - avg) ** 2, 0) / vals.length;

        this.results.set(model, {
          model, provider, scores,
          avgScore: avg,
          medianScore: median,
          stddev: Math.sqrt(variance),
          minScore: sorted[0],
          maxScore: sorted[sorted.length - 1],
          totalTokens: { input: totalInput, output: totalOutput },
        });
      }
    }

    this.renderAll();
  }

  // ====== Run Controls ======

  private async startLeaderboard(): Promise<void> {
    const entries = this.getSelectedEntries();
    if (entries.length === 0) {
      this.statusEl.innerHTML = `<span style="color: var(--red);">No models selected. Check at least one model above.</span>`;
      return;
    }

    // Validate API keys
    for (const e of entries) {
      if (!e.apiKey) {
        this.statusEl.innerHTML = `<span style="color: var(--red);">Missing API key for ${e.model}. Configure in SIMULATOR tab.</span>`;
        return;
      }
    }

    this.running = true;
    this.runBtn.style.display = 'none';
    this.stopBtn.style.display = 'inline-block';

    this.runner = new LeaderboardRunner();

    await this.runner.run(entries, this.state.config, {
      onModelStart: (model, mi, total) => {
        this.runningModel = model;
        this.statusEl.innerHTML = `<span class="lb-status-model">${model}</span> (${mi + 1}/${total})`;
        if (!this.seedScores.has(model)) {
          this.seedScores.set(model, new Map());
        }
      },

      onSeedStart: (model, seed, fromCache) => {
        this.runningSeed = seed;
        this.runningRound = 0;
        if (fromCache) {
          this.statusEl.innerHTML =
            `<span class="lb-status-model">${model}</span><br>` +
            `Seed ${seed} — <span style="color:var(--text-dim);">cached</span>`;
        } else {
          this.statusEl.innerHTML =
            `<span class="lb-status-model">${model}</span><br>` +
            `<span class="lb-status-seed">Seed ${seed}</span> — starting...`;
        }
      },

      onSeedProgress: (model, seed, round, totalRounds) => {
        this.runningRound = round;
        this.runningTotalRounds = totalRounds;
        this.statusEl.innerHTML =
          `<span class="lb-status-model">${model}</span><br>` +
          `<span class="lb-status-seed">Seed ${seed}</span> — Round ${round + 1}/${totalRounds}`;
      },

      onSeedComplete: (model, seed, score, fromCache) => {
        const scoreMap = this.seedScores.get(model) ?? new Map();
        scoreMap.set(seed, { score, cached: fromCache });
        this.seedScores.set(model, scoreMap);
        this.renderMatrix();
      },

      onModelComplete: (model, result) => {
        this.results.set(model, result);
        this.renderAll();
      },

      onAllComplete: () => {
        this.running = false;
        this.runBtn.style.display = 'inline-block';
        this.stopBtn.style.display = 'none';
        this.statusEl.innerHTML = `<span style="color:var(--green);">Leaderboard complete.</span>`;
        this.renderAll();
      },

      onError: (model, seed, error) => {
        console.error(`Leaderboard error: ${model} seed ${seed}:`, error);
      },
    });

    if (this.running) {
      this.running = false;
      this.runBtn.style.display = 'inline-block';
      this.stopBtn.style.display = 'none';
      this.statusEl.innerHTML += ' (stopped)';
    }
  }

  private stopLeaderboard(): void {
    if (this.runner) {
      this.runner.stop();
      this.running = false;
      this.runBtn.style.display = 'inline-block';
      this.stopBtn.style.display = 'none';
    }
  }

  private async clearCache(): Promise<void> {
    await deleteAllRuns();
    this.results.clear();
    this.seedScores.clear();
    this.activeCell = null;
    this.renderAll();
    this.statusEl.innerHTML = `<span style="color:var(--text-dim);">Cache cleared.</span>`;
  }

  // ====== Render All ======

  private renderAll(): void {
    this.renderRankingTable();
    this.renderMatrix();
    this.renderChart();
  }

  // ====== Ranking Table ======

  private renderRankingTable(): void {
    const sorted = [...this.results.values()].sort((a, b) => b.avgScore - a.avgScore);

    if (sorted.length === 0) {
      this.rankingBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No results yet. Run the leaderboard to see rankings.</td></tr>`;
      return;
    }

    this.rankingBody.innerHTML = sorted.map((r, i) => {
      const complete = r.scores.length === LEADERBOARD_SEEDS.length;
      const cls = complete ? 'lb-row-complete' : '';
      return `<tr class="${cls}">
        <td>${i + 1}</td>
        <td>${r.model}</td>
        <td>${r.avgScore.toFixed(1)}</td>
        <td>${r.medianScore.toFixed(1)}</td>
        <td>${r.stddev.toFixed(1)}</td>
        <td>${r.minScore}</td>
        <td>${r.maxScore}</td>
        <td>${r.scores.length}/${LEADERBOARD_SEEDS.length}</td>
      </tr>`;
    }).join('');
  }

  // ====== Seed Score Matrix ======

  private renderMatrix(): void {
    const models = [...this.seedScores.keys()];
    if (models.length === 0) {
      this.matrixWrap.innerHTML = `<div style="color:var(--text-muted); font-size:11px;">No data yet.</div>`;
      return;
    }

    const header = `<tr><th>Model</th>${LEADERBOARD_SEEDS.map(s => `<th>S${s}</th>`).join('')}<th>Avg</th></tr>`;

    const rows = models.map(model => {
      const scoreMap = this.seedScores.get(model)!;
      let sum = 0;
      let count = 0;

      const cells = LEADERBOARD_SEEDS.map(seed => {
        const entry = scoreMap.get(seed);
        if (!entry) {
          if (this.runningModel === model && this.runningSeed === seed && this.running) {
            return `<td class="lb-cell--running">R${this.runningRound + 1}</td>`;
          }
          return `<td class="lb-cell--pending">--</td>`;
        }
        sum += entry.score;
        count++;
        const cls = entry.cached ? 'lb-cell--cached' : 'lb-cell--complete';
        return `<td class="${cls}" data-model="${model}" data-seed="${seed}">${entry.score}</td>`;
      }).join('');

      const avg = count > 0 ? (sum / count).toFixed(1) : '--';
      const modelShort = model.length > 18 ? model.slice(0, 16) + '..' : model;

      return `<tr><td class="lb-model-cell" title="${model}">${modelShort}</td>${cells}<td class="lb-avg-cell">${avg}</td></tr>`;
    }).join('');

    this.matrixWrap.innerHTML = `<table class="lb-matrix"><thead>${header}</thead><tbody>${rows}</tbody></table>`;

    // Add click handlers to completed cells
    this.matrixWrap.querySelectorAll<HTMLTableCellElement>('.lb-cell--complete, .lb-cell--cached').forEach(td => {
      td.addEventListener('click', () => {
        const model = td.dataset.model!;
        const seed = parseInt(td.dataset.seed!);
        this.showDetail(model, seed);
      });
    });
  }

  // ====== Bar Chart ======

  private renderChart(): void {
    const canvas = this.chartCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const sorted = [...this.results.values()].sort((a, b) => b.avgScore - a.avgScore);
    if (sorted.length === 0) return;

    const maxScore = Math.max(...sorted.map(r => r.maxScore), 1);
    const pad = { top: 10, bottom: 30, left: 10, right: 10 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const barH = Math.min(28, chartH / sorted.length - 4);

    // Find the player color for each model
    const modelColors = new Map<string, string>();
    for (const p of this.state.players) {
      modelColors.set(p.model, p.color);
    }

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const y = pad.top + i * (chartH / sorted.length) + (chartH / sorted.length - barH) / 2;
      const barWidth = (r.avgScore / maxScore) * chartW;
      const color = modelColors.get(r.model) || '#FFD700';

      // Bar
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(pad.left, y, barWidth, barH);
      ctx.globalAlpha = 1;

      // Score range (min-max) as thin line
      const minX = pad.left + (r.minScore / maxScore) * chartW;
      const maxX = pad.left + (r.maxScore / maxScore) * chartW;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(minX, y + barH / 2);
      ctx.lineTo(maxX, y + barH / 2);
      ctx.stroke();

      // Label
      const label = r.model.length > 20 ? r.model.slice(0, 18) + '..' : r.model;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`${label}  ${r.avgScore.toFixed(1)}`, pad.left + 4, y + barH / 2 + 3);
    }
  }

  // ====== Seed Detail Panel ======

  private async showDetail(model: string, seed: number): Promise<void> {
    this.activeCell = { model, seed };
    this.detailEl.style.display = 'block';

    const cfgHash = computeConfigHash(this.state.config);
    const cacheKey = makeCacheKey(model, cfgHash, seed);
    const record = await getRunByCacheKey(cacheKey);

    if (!record) {
      this.detailEl.innerHTML = `<div class="lb-detail-title">${model} — Seed ${seed}</div><div style="color:var(--text-muted);">No detailed data available.</div>`;
      return;
    }

    this.detailEl.innerHTML = `
      <button class="lb-detail-close" id="lb-detail-close">CLOSE</button>
      <div class="lb-detail-title">${model} — Seed ${seed}</div>
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:4px;">
        Final Score: <span style="color:var(--gold); font-weight:bold;">${record.finalScore}</span>
        &nbsp;|&nbsp; Tokens: ${(record.totalTokens.input + record.totalTokens.output).toLocaleString()}
        &nbsp;|&nbsp; ${new Date(record.timestamp).toLocaleString()}
      </div>
      <div class="panel-section-title" style="margin-top:8px;">SCORE PROGRESSION (20 ROUNDS)</div>
      <canvas id="lb-detail-chart"></canvas>
      <div class="lb-detail-rounds" id="lb-detail-rounds"></div>
    `;

    this.detailEl.querySelector('#lb-detail-close')!.addEventListener('click', () => {
      this.detailEl.style.display = 'none';
      this.activeCell = null;
    });

    // Render score progression chart
    this.renderDetailChart(record);

    // Render round score tags
    const roundsEl = this.detailEl.querySelector('#lb-detail-rounds')!;
    roundsEl.innerHTML = record.roundResults.map((rr, i) => {
      const score = rr.players[0]?.score ?? 0;
      return `<span title="Round ${i + 1}">R${i + 1}: ${score}</span>`;
    }).join('');
  }

  private renderDetailChart(record: LeaderboardRunRecord): void {
    const canvas = this.detailEl.querySelector('#lb-detail-chart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const rounds = record.roundResults;
    if (rounds.length === 0) return;

    const scores = rounds.map(rr => rr.players[0]?.score ?? 0);
    const maxScore = Math.max(...scores, 1);
    const pad = { top: 8, bottom: 20, left: 35, right: 10 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Y-axis labels
    ctx.fillStyle = '#8B7500';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(String(maxScore), pad.left - 4, pad.top + 8);
    ctx.fillText('0', pad.left - 4, h - pad.bottom + 3);

    // Grid line
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

    // Line chart
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < scores.length; i++) {
      const x = pad.left + (i / (scores.length - 1 || 1)) * chartW;
      const y = pad.top + chartH * (1 - scores[i] / maxScore);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dots
    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < scores.length; i++) {
      const x = pad.left + (i / (scores.length - 1 || 1)) * chartW;
      const y = pad.top + chartH * (1 - scores[i] / maxScore);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // X-axis labels
    ctx.fillStyle = '#8B7500';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(scores.length / 10));
    for (let i = 0; i < scores.length; i += step) {
      const x = pad.left + (i / (scores.length - 1 || 1)) * chartW;
      ctx.fillText(`R${i + 1}`, x, h - 4);
    }
  }
}

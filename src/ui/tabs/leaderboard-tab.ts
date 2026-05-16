import type { AppState, Tab } from '../app';
import type { ApiProvider, LeaderboardRunRecord } from '../../types';
import { LEADERBOARD_SEEDS } from '../../constants';
import { TOTAL_ROUNDS } from '../../llm/multi-player-iteration-engine';
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
  private exportBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private progressBarEl!: HTMLElement;
  private progressFillEl!: HTMLElement;
  private progressTextEl!: HTMLElement;
  private clearBtn!: HTMLButtonElement;
  private rankingBody!: HTMLElement;
  private heatmapWrap!: HTMLElement;
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
            <div id="lb-progress-bar" class="lb-progress-bar" style="display:none;">
              <div id="lb-progress-fill" class="lb-progress-fill"></div>
            </div>
            <div id="lb-progress-text" class="lb-progress-text"></div>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">EXPORT / CACHE</div>
            <div class="btn-row">
              <button class="btn btn-outline" id="lb-btn-export" style="font-size:10px;">EXPORT CSV</button>
              <button class="btn btn-outline" id="lb-btn-clear" style="font-size:10px;">CLEAR CACHE</button>
            </div>
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

          <div class="lb-heatmap-section panel-section">
            <div class="panel-section-title">SEED HEATMAP (${LEADERBOARD_SEEDS.length} SEEDS)</div>
            <div id="lb-heatmap-wrap" class="lb-heatmap-wrap"></div>
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
    this.exportBtn = this.el.querySelector('#lb-btn-export') as HTMLButtonElement;
    this.statusEl = this.el.querySelector('#lb-status')!;
    this.progressBarEl = this.el.querySelector('#lb-progress-bar')!;
    this.progressFillEl = this.el.querySelector('#lb-progress-fill')!;
    this.progressTextEl = this.el.querySelector('#lb-progress-text')!;
    this.clearBtn = this.el.querySelector('#lb-btn-clear') as HTMLButtonElement;
    this.rankingBody = this.el.querySelector('#lb-ranking-body')!;
    this.heatmapWrap = this.el.querySelector('#lb-heatmap-wrap')!;
    this.chartCanvas = this.el.querySelector('#lb-chart') as HTMLCanvasElement;
    this.detailEl = this.el.querySelector('#lb-detail')!;

    this.runBtn.addEventListener('click', () => this.startLeaderboard());
    this.stopBtn.addEventListener('click', () => this.stopLeaderboard());
    this.exportBtn.addEventListener('click', () => this.exportCsv());
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

    for (const e of entries) {
      if (!e.apiKey) {
        this.statusEl.innerHTML = `<span style="color: var(--red);">Missing API key for ${e.model}. Configure in SIMULATOR tab.</span>`;
        return;
      }
    }

    this.running = true;
    this.runBtn.style.display = 'none';
    this.stopBtn.style.display = 'inline-block';
    this.progressBarEl.style.display = 'block';

    this.runner = new LeaderboardRunner();
    let globalDone = 0;
    const totalSeeds = LEADERBOARD_SEEDS.length * entries.length;

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
        this.renderHeatmaps();
      },

      onSeedComplete: (model, seed, score, fromCache) => {
        const scoreMap = this.seedScores.get(model) ?? new Map();
        scoreMap.set(seed, { score, cached: fromCache });
        this.seedScores.set(model, scoreMap);
        globalDone++;
        const pct = Math.round((globalDone / totalSeeds) * 100);
        this.progressFillEl.style.width = `${pct}%`;
        this.progressTextEl.textContent = `${globalDone} / ${totalSeeds} seeds (${pct}%)`;
        this.renderHeatmaps();
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
    this.progressFillEl.style.width = '0%';
    this.progressTextEl.textContent = '';
    this.progressBarEl.style.display = 'none';
    this.renderAll();
    this.statusEl.innerHTML = `<span style="color:var(--text-dim);">Cache cleared.</span>`;
  }

  // ====== CSV Export ======

  private exportCsv(): void {
    const sorted = [...this.results.values()].sort((a, b) => b.avgScore - a.avgScore);
    if (sorted.length === 0) {
      this.statusEl.innerHTML = `<span style="color:var(--text-dim);">No data to export.</span>`;
      return;
    }

    // Header row
    const seedHeaders = LEADERBOARD_SEEDS.map(s => `seed_${s}`).join(',');
    const header = `rank,model,provider,avg_score,median,stddev,min,max,seeds_completed,${seedHeaders}`;

    const rows = sorted.map((r, i) => {
      const scoreMap = this.seedScores.get(r.model) ?? new Map<number, { score: number }>();
      const seedVals = LEADERBOARD_SEEDS.map(s => {
        const e = scoreMap.get(s);
        return e != null ? e.score : '';
      }).join(',');
      return [
        i + 1,
        `"${r.model}"`,
        r.provider,
        r.avgScore.toFixed(2),
        r.medianScore.toFixed(2),
        r.stddev.toFixed(2),
        r.minScore,
        r.maxScore,
        r.scores.length,
        seedVals,
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gravwell-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ====== Render All ======

  private renderAll(): void {
    this.renderRankingTable();
    this.renderHeatmaps();
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

  // ====== Heatmap ======

  private renderHeatmaps(): void {
    const models = [...this.seedScores.keys()];
    if (models.length === 0) {
      this.heatmapWrap.innerHTML = `<div style="color:var(--text-muted); font-size:11px;">No data yet.</div>`;
      return;
    }

    // Compute global max for consistent color scaling
    let globalMax = 1;
    for (const scoreMap of this.seedScores.values()) {
      for (const entry of scoreMap.values()) {
        if (entry.score > globalMax) globalMax = entry.score;
      }
    }

    const COLS = 10;
    const heatmaps = models.map(model => {
      const scoreMap = this.seedScores.get(model)!;
      const player = this.state.players.find(p => p.model === model);
      const modelColor = player?.color ?? '#FFD700';
      const modelShort = model.length > 22 ? model.slice(0, 20) + '..' : model;
      const result = this.results.get(model);
      const avgLabel = result ? `avg ${result.avgScore.toFixed(1)}` : '';
      const completedCount = scoreMap.size;

      const cells = LEADERBOARD_SEEDS.map((seed, idx) => {
        const entry = scoreMap.get(seed);
        const row = Math.floor(idx / COLS);
        const col = idx % COLS;

        if (!entry) {
          // Pending or running
          if (this.running && this.runningModel === model && this.runningSeed === seed) {
            const roundLabel = this.runningTotalRounds > 0
              ? `R${this.runningRound + 1}/${this.runningTotalRounds}`
              : '...';
            return `<div class="lb-hcell lb-hcell--running" style="grid-row:${row+1};grid-column:${col+1};" title="Seed ${seed}: running (${roundLabel})">${roundLabel}</div>`;
          }
          return `<div class="lb-hcell lb-hcell--pending" style="grid-row:${row+1};grid-column:${col+1};" title="Seed ${seed}: pending"></div>`;
        }

        const t = Math.min(entry.score / globalMax, 1);
        const bg = lerpColor('#1a0f00', '#FFD700', t);
        const fg = t > 0.55 ? '#000' : '#FFD700';
        const cachedMark = entry.cached ? '·' : '';
        return `<div class="lb-hcell lb-hcell--done" style="grid-row:${row+1};grid-column:${col+1};background:${bg};color:${fg};" data-model="${model}" data-seed="${seed}" title="Seed ${seed}: ${entry.score}${entry.cached ? ' (cached)' : ''}">${entry.score}${cachedMark}</div>`;
      }).join('');

      const completedBar = `<div class="lb-hmap-progress">
        <div class="lb-hmap-progress-fill" style="width:${(completedCount / LEADERBOARD_SEEDS.length * 100).toFixed(0)}%; background:${modelColor};"></div>
      </div>`;

      return `<div class="lb-hmap-block">
        <div class="lb-hmap-header">
          <span class="lb-hmap-name" style="color:${modelColor};">${modelShort}</span>
          <span class="lb-hmap-meta">${completedCount}/${LEADERBOARD_SEEDS.length} ${avgLabel}</span>
        </div>
        ${completedBar}
        <div class="lb-hmap-grid">${cells}</div>
      </div>`;
    });

    this.heatmapWrap.innerHTML = heatmaps.join('');

    // Attach click handlers
    this.heatmapWrap.querySelectorAll<HTMLElement>('.lb-hcell--done').forEach(cell => {
      cell.addEventListener('click', () => {
        const model = cell.dataset.model!;
        const seed = parseInt(cell.dataset.seed!);
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
    if (w === 0 || h === 0) return;
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

    const modelColors = new Map<string, string>();
    for (const p of this.state.players) {
      modelColors.set(p.model, p.color);
    }

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const y = pad.top + i * (chartH / sorted.length) + (chartH / sorted.length - barH) / 2;
      const barWidth = (r.avgScore / maxScore) * chartW;
      const color = modelColors.get(r.model) || '#FFD700';

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(pad.left, y, barWidth, barH);
      ctx.globalAlpha = 1;

      // Min–max range line
      const minX = pad.left + (r.minScore / maxScore) * chartW;
      const maxX = pad.left + (r.maxScore / maxScore) * chartW;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(minX, y + barH / 2);
      ctx.lineTo(maxX, y + barH / 2);
      ctx.stroke();

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
      <div class="panel-section-title" style="margin-top:8px;">SCORE PROGRESSION (${TOTAL_ROUNDS} ROUNDS)</div>
      <canvas id="lb-detail-chart"></canvas>
      <div class="lb-detail-rounds" id="lb-detail-rounds"></div>
    `;

    this.detailEl.querySelector('#lb-detail-close')!.addEventListener('click', () => {
      this.detailEl.style.display = 'none';
      this.activeCell = null;
    });

    this.renderDetailChart(record);

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

    ctx.fillStyle = '#8B7500';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(String(maxScore), pad.left - 4, pad.top + 8);
    ctx.fillText('0', pad.left - 4, h - pad.bottom + 3);

    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

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

    ctx.fillStyle = '#FFD700';
    for (let i = 0; i < scores.length; i++) {
      const x = pad.left + (i / (scores.length - 1 || 1)) * chartW;
      const y = pad.top + chartH * (1 - scores[i] / maxScore);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#8B7500';
    ctx.textAlign = 'center';
    for (let i = 0; i < scores.length; i++) {
      const x = pad.left + (i / (scores.length - 1 || 1)) * chartW;
      ctx.fillText(`R${i + 1}`, x, h - 4);
    }
  }
}

// ====== Color Utility ======

function lerpColor(hex1: string, hex2: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

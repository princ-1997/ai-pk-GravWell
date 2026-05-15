import type { AppState, Tab } from '../app';
import { MultiSeedRunner, type MultiSeedResult, type MultiSeedSummary } from '../../modes/multi-seed-runner';

export class FullRunsTab implements Tab {
  el: HTMLElement;
  private state: AppState;
  private runner: MultiSeedRunner | null = null;
  private running = false;

  // DOM refs
  private seedInput!: HTMLInputElement;
  private runBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private progressEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private tableBody!: HTMLElement;
  private chartCanvas!: HTMLCanvasElement;

  constructor(state: AppState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div class="full-runs-layout">
        <div class="full-runs-controls">
          <div class="panel-section">
            <div class="panel-section-title">MULTI-SEED BATCH RUN</div>
            <div class="field-row">
              <label class="field-label">SEEDS</label>
              <input type="text" class="field-input" id="fr-seed-input" value="1-20" placeholder="e.g. 1-20 or 1,5,10">
            </div>
            <div class="btn-row">
              <button class="btn" id="fr-btn-run">RUN BATCH</button>
              <button class="btn btn-outline" id="fr-btn-stop" style="display:none;">STOP</button>
            </div>
            <div id="fr-progress" style="margin-top: 8px; font-size: 11px; color: var(--text-dim);"></div>
          </div>

          <div class="panel-section" id="fr-stats-section">
            <div class="panel-section-title">STATISTICS</div>
            <div id="fr-stats" class="full-runs-stats">
              <div class="fr-stat-empty">Run a batch to see statistics.</div>
            </div>
          </div>

          <div class="panel-section">
            <div class="panel-section-title">SCORE DISTRIBUTION</div>
            <canvas id="fr-chart" width="300" height="160"></canvas>
          </div>
        </div>

        <div class="full-runs-results">
          <div class="panel-section" style="flex:1; overflow:hidden; display:flex; flex-direction:column;">
            <div class="panel-section-title">RESULTS TABLE</div>
            <div class="full-runs-table-wrap">
              <table class="full-runs-table">
                <thead>
                  <tr>
                    <th>Seed</th>
                    <th>Score</th>
                    <th>Alive</th>
                    <th>Crashed</th>
                    <th>Fuel Used</th>
                    <th>Zone Ticks</th>
                  </tr>
                </thead>
                <tbody id="fr-table-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    this.seedInput = this.el.querySelector('#fr-seed-input') as HTMLInputElement;
    this.runBtn = this.el.querySelector('#fr-btn-run') as HTMLButtonElement;
    this.stopBtn = this.el.querySelector('#fr-btn-stop') as HTMLButtonElement;
    this.progressEl = this.el.querySelector('#fr-progress') as HTMLElement;
    this.statsEl = this.el.querySelector('#fr-stats') as HTMLElement;
    this.tableBody = this.el.querySelector('#fr-table-body') as HTMLElement;
    this.chartCanvas = this.el.querySelector('#fr-chart') as HTMLCanvasElement;

    this.runBtn.addEventListener('click', () => this.startRun());
    this.stopBtn.addEventListener('click', () => this.stopRun());
  }

  onActivate(): void {
    // Re-render chart in case canvas was resized
    const summary = this.lastSummary;
    if (summary) this.renderChart(summary);
  }

  private lastSummary: MultiSeedSummary | null = null;

  private async startRun(): Promise<void> {
    if (!this.state.currentDecide) {
      this.progressEl.innerHTML = `<span style="color: var(--red);">No bot loaded. Go to Simulator tab and generate or load a bot first.</span>`;
      return;
    }

    const seeds = this.parseSeeds(this.seedInput.value);
    if (seeds.length === 0) {
      this.progressEl.innerHTML = `<span style="color: var(--red);">Invalid seed range. Use "1-20" or "1,5,10,15".</span>`;
      return;
    }

    this.running = true;
    this.runBtn.disabled = true;
    this.stopBtn.style.display = 'inline-block';
    this.tableBody.innerHTML = '';
    this.statsEl.innerHTML = '<div class="fr-stat-empty">Running...</div>';
    this.clearChart();

    this.runner = new MultiSeedRunner();

    await this.runner.run(
      this.state.config,
      seeds,
      this.state.currentDecide,
      {
        onSeedComplete: (result, index, total) => {
          this.progressEl.textContent = `Seed ${result.seed} complete — ${index + 1}/${total}`;
          this.appendTableRow(result);
        },
        onAllComplete: (summary) => {
          this.lastSummary = summary;
          this.running = false;
          this.runBtn.disabled = false;
          this.stopBtn.style.display = 'none';
          this.progressEl.textContent = `Batch complete — ${summary.results.length} seeds.`;
          this.renderStats(summary);
          this.renderChart(summary);
        },
      }
    );

    if (this.running) {
      // Stopped early
      this.running = false;
      this.runBtn.disabled = false;
      this.stopBtn.style.display = 'none';
      this.progressEl.textContent += ' (stopped)';
    }
  }

  private stopRun(): void {
    if (this.runner) {
      this.runner.stop();
      this.running = false;
      this.runBtn.disabled = false;
      this.stopBtn.style.display = 'none';
    }
  }

  private parseSeeds(input: string): number[] {
    input = input.trim();
    // Range format: "1-20"
    const rangeMatch = input.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      if (start > end || end - start > 999) return [];
      const seeds = [];
      for (let i = start; i <= end; i++) seeds.push(i);
      return seeds;
    }
    // Comma format: "1,5,10"
    const parts = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    return parts;
  }

  private appendTableRow(result: MultiSeedResult): void {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${result.seed}</td>
      <td>${result.score}</td>
      <td>${result.shipsAlive}</td>
      <td>${result.shipsCrashed}</td>
      <td>${result.fuelUsed.toFixed(1)}</td>
      <td>${result.ticksInZone}</td>
    `;
    this.tableBody.appendChild(tr);
  }

  private renderStats(summary: MultiSeedSummary): void {
    this.statsEl.innerHTML = `
      <div class="fr-stat-row"><span class="fr-stat-label">Mean</span><span class="fr-stat-value">${summary.mean.toFixed(1)}</span></div>
      <div class="fr-stat-row"><span class="fr-stat-label">Median</span><span class="fr-stat-value">${summary.median.toFixed(1)}</span></div>
      <div class="fr-stat-row"><span class="fr-stat-label">Std Dev</span><span class="fr-stat-value">${summary.stddev.toFixed(1)}</span></div>
      <div class="fr-stat-row"><span class="fr-stat-label">Min</span><span class="fr-stat-value">${summary.min} (seed ${summary.minSeed})</span></div>
      <div class="fr-stat-row"><span class="fr-stat-label">Max</span><span class="fr-stat-value">${summary.max} (seed ${summary.maxSeed})</span></div>
    `;
  }

  private clearChart(): void {
    const ctx = this.chartCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.chartCanvas.width, this.chartCanvas.height);
  }

  private renderChart(summary: MultiSeedSummary): void {
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

    const results = summary.results;
    if (results.length === 0) return;

    const maxScore = Math.max(summary.max, 1);
    const padding = { top: 10, bottom: 20, left: 35, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = Math.max(2, chartW / results.length - 1);

    // Y-axis labels
    ctx.fillStyle = '#8B7500';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(String(maxScore), padding.left - 4, padding.top + 8);
    ctx.fillText('0', padding.left - 4, h - padding.bottom + 3);

    // Median line
    const medianY = padding.top + chartH * (1 - summary.median / maxScore);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, medianY);
    ctx.lineTo(w - padding.right, medianY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bars
    for (let i = 0; i < results.length; i++) {
      const score = results[i].score;
      const barH = (score / maxScore) * chartH;
      const x = padding.left + (i * chartW) / results.length;
      const y = padding.top + chartH - barH;

      ctx.fillStyle = score >= summary.median
        ? 'rgba(68, 255, 68, 0.7)'
        : 'rgba(255, 68, 68, 0.5)';
      ctx.fillRect(x, y, barW, barH);
    }

    // X-axis labels (sparse)
    ctx.fillStyle = '#8B7500';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(results.length / 10));
    for (let i = 0; i < results.length; i += step) {
      const x = padding.left + (i * chartW) / results.length + barW / 2;
      ctx.fillText(String(results[i].seed), x, h - 4);
    }
  }
}

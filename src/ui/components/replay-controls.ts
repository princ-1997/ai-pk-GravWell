import type { Player, RoundResult } from '../../types';
import { PLAYER_COLORS } from '../../constants';
import type { AppState } from '../app';

export interface ReplayControlsCallbacks {
  onPlay: () => void;
  onStop: () => void;
  onRoundSelect: (round: number) => void;
}

export class ReplayControls {
  private el: HTMLElement;
  private state: AppState;
  private statusArea: HTMLElement;
  private statsContainer: HTMLElement;
  private roundSlider: HTMLInputElement;
  private roundLabel: HTMLElement;
  private chartCanvas: HTMLCanvasElement;
  private callbacks: ReplayControlsCallbacks;
  private lastChartData: { roundResults: RoundResult[]; players: Player[] } | null = null;

  constructor(parent: HTMLElement, state: AppState, callbacks: ReplayControlsCallbacks) {
    this.state = state;
    this.callbacks = callbacks;

    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">REPLAY</div>
        <div class="round-control" style="margin-bottom: 8px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <label class="field-label" style="width:auto;">ROUND</label>
            <input type="range" class="round-slider" id="round-slider" min="0" max="0" value="0" disabled>
            <span class="round-label" id="round-label">-</span>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-outline" id="btn-play-replay">PLAY</button>
          <button class="btn btn-outline" id="btn-stop-replay">STOP</button>
        </div>
        <div class="replay-controls" style="margin-top: 8px;">
          <label class="field-label" style="width:auto; margin-right:6px;">SPEED</label>
          <input type="range" class="speed-slider" id="speed-slider" min="0.25" max="5" step="0.25" value="1">
          <span class="speed-label" id="speed-label">1.0x</span>
        </div>
        <div id="status-area" style="margin-top: 8px;"></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">SCORE PROGRESSION</div>
        <canvas class="score-chart" id="score-chart" width="300" height="120"></canvas>
      </div>
      <div class="panel-section" id="player-stats-section">
        <div class="panel-section-title">RESULTS</div>
        <div id="player-stats"></div>
      </div>
    `;
    parent.appendChild(this.el);

    this.statusArea = this.el.querySelector('#status-area') as HTMLElement;
    this.statsContainer = this.el.querySelector('#player-stats') as HTMLElement;
    this.roundSlider = this.el.querySelector('#round-slider') as HTMLInputElement;
    this.roundLabel = this.el.querySelector('#round-label') as HTMLElement;
    this.chartCanvas = this.el.querySelector('#score-chart') as HTMLCanvasElement;

    this.el.querySelector('#btn-play-replay')!.addEventListener('click', callbacks.onPlay);
    this.el.querySelector('#btn-stop-replay')!.addEventListener('click', callbacks.onStop);

    // Speed slider
    const speedSlider = this.el.querySelector('#speed-slider') as HTMLInputElement;
    speedSlider.addEventListener('input', () => {
      this.state.replaySpeed = parseFloat(speedSlider.value);
      this.el.querySelector('#speed-label')!.textContent = `${this.state.replaySpeed.toFixed(1)}x`;
    });

    // Round slider
    this.roundSlider.addEventListener('input', () => {
      const round = parseInt(this.roundSlider.value);
      this.roundLabel.textContent = `${round + 1}`;
      this.callbacks.onRoundSelect(round);
    });

    this.renderPlayerStats([]);
  }

  showStatus(html: string, type: 'info' | 'error' | 'success'): void {
    this.statusArea.innerHTML = `<div class="status-msg ${type}">${html}</div>`;
  }

  updateRoundSlider(totalRounds: number, currentRound: number): void {
    this.roundSlider.max = String(Math.max(0, totalRounds - 1));
    this.roundSlider.value = String(currentRound);
    this.roundSlider.disabled = totalRounds === 0;
    this.roundLabel.textContent = totalRounds > 0 ? `${currentRound + 1}` : '-';
  }

  updateStats(tick: number, scores: number[], winner: string): void {
    const tickEl = document.getElementById('stat-tick');
    const scoreEl = document.getElementById('stat-score');
    const winnerEl = document.getElementById('stat-winner');
    if (!tickEl || !scoreEl || !winnerEl) return;
    tickEl.textContent = `${tick} / ${this.state.config.totalTicks}`;
    scoreEl.textContent = scores.length === 1
      ? `P1 ${scores[0]}`
      : scores.map((s, i) => `P${i + 1} ${s}`).join(' ');
    winnerEl.textContent = winner;
  }

  renderPlayerStats(players: Player[], roundResult?: RoundResult): void {
    if (players.length === 0 || !roundResult) {
      this.statsContainer.innerHTML = '<div style="color:var(--text-dim); font-size:11px;">No results yet</div>';
      return;
    }

    const html = players.map(p => {
      const pd = roundResult.players.find(rd => rd.playerId === p.id);
      if (!pd) return '';
      const ships = pd.diagnostic.perShip;
      const alive = ships.filter(s => s.alive).length;
      const crashed = ships.filter(s => !s.alive).length;
      const fuelLeft = ships.reduce((sum, s) => sum + s.fuelRemaining, 0).toFixed(1);

      return `<div class="player-stat">
        <div class="player-dot" style="background: ${p.color}"></div>
        <span class="player-name">P${p.id + 1} ${p.label}</span>
        <span class="player-detail">${alive} alive | ${crashed} crashed | fuel ${fuelLeft}</span>
        <span class="player-score">${pd.score}</span>
      </div>`;
    }).join('');
    this.statsContainer.innerHTML = html;
  }

  renderScoreChart(roundResults: RoundResult[], players: Player[]): void {
    // Store latest data so chart can be re-rendered on tab reactivation
    this.lastChartData = { roundResults, players };

    const canvas = this.chartCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Skip rendering if canvas is hidden (e.g. tab not active) — dimensions are 0
    if (w === 0 || h === 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (roundResults.length === 0 || players.length === 0) return;

    const padding = { top: 10, bottom: 20, left: 35, right: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Find max score across all players and rounds
    let maxScore = 1;
    for (const rr of roundResults) {
      for (const pd of rr.players) {
        if (pd.score > maxScore) maxScore = pd.score;
      }
    }

    // Y-axis labels
    ctx.fillStyle = '#8B7500';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(String(maxScore), padding.left - 4, padding.top + 8);
    ctx.fillText('0', padding.left - 4, h - padding.bottom + 3);

    // X-axis labels
    ctx.textAlign = 'center';
    const totalRounds = roundResults.length;
    const step = Math.max(1, Math.floor(totalRounds / 10));
    for (let i = 0; i < totalRounds; i += step) {
      const x = padding.left + (i / Math.max(1, totalRounds - 1)) * chartW;
      ctx.fillText(`R${i + 1}`, x, h - 4);
    }

    // Grid line at 50%
    const midY = padding.top + chartH * 0.5;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, midY);
    ctx.lineTo(w - padding.right, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw line for each player
    for (const player of players) {
      const scores = roundResults.map(rr => {
        const pd = rr.players.find(p => p.playerId === player.id);
        return pd ? pd.score : 0;
      });

      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < scores.length; i++) {
        const x = padding.left + (i / Math.max(1, totalRounds - 1)) * chartW;
        const y = padding.top + chartH * (1 - scores[i] / maxScore);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw dots
      ctx.fillStyle = player.color;
      for (let i = 0; i < scores.length; i++) {
        const x = padding.left + (i / Math.max(1, totalRounds - 1)) * chartW;
        const y = padding.top + chartH * (1 - scores[i] / maxScore);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Re-render the chart from cached data (call on tab reactivation). */
  refreshChart(): void {
    if (this.lastChartData) {
      this.renderScoreChart(this.lastChartData.roundResults, this.lastChartData.players);
    }
  }
}

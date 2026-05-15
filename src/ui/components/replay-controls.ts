import type { SimulationResult } from '../../types';
import { PLAYER_COLORS } from '../../constants';
import type { AppState } from '../app';

export interface ReplayControlsCallbacks {
  onRun: () => void;
  onPlay: () => void;
  onStop: () => void;
  onCopyReport: () => void;
}

export class ReplayControls {
  private el: HTMLElement;
  private state: AppState;
  private runBtn: HTMLButtonElement;
  private playBtn: HTMLButtonElement;
  private statusArea: HTMLElement;
  private statsContainer: HTMLElement;

  constructor(parent: HTMLElement, state: AppState, callbacks: ReplayControlsCallbacks) {
    this.state = state;

    this.el = document.createElement('div');
    this.el.innerHTML = `
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
      <div class="panel-section" id="player-stats-section">
        <div class="panel-section-title">Results</div>
        <div id="player-stats"></div>
        <div class="btn-row" style="margin-top: 6px;">
          <button class="btn btn-sm btn-outline" id="btn-copy-report">COPY REPORT</button>
        </div>
      </div>
    `;
    parent.appendChild(this.el);

    this.runBtn = this.el.querySelector('#btn-run') as HTMLButtonElement;
    this.playBtn = this.el.querySelector('#btn-play') as HTMLButtonElement;
    this.statusArea = this.el.querySelector('#status-area') as HTMLElement;
    this.statsContainer = this.el.querySelector('#player-stats') as HTMLElement;

    this.runBtn.addEventListener('click', callbacks.onRun);
    this.playBtn.addEventListener('click', callbacks.onPlay);
    this.el.querySelector('#btn-stop')!.addEventListener('click', callbacks.onStop);
    this.el.querySelector('#btn-copy-report')!.addEventListener('click', callbacks.onCopyReport);

    // Speed slider
    const slider = this.el.querySelector('#speed-slider') as HTMLInputElement;
    slider.addEventListener('input', () => {
      this.state.replaySpeed = parseFloat(slider.value);
      this.el.querySelector('#speed-label')!.textContent = `${this.state.replaySpeed.toFixed(1)}x`;
    });

    this.renderPlayerStats(null);
  }

  showStatus(html: string, type: 'info' | 'error' | 'success'): void {
    this.statusArea.innerHTML = `<div class="status-msg ${type}">${html}</div>`;
  }

  updateStats(tick: number, scores: number[], winner: string): void {
    document.getElementById('stat-tick')!.textContent = `${tick} / ${this.state.config.totalTicks}`;
    document.getElementById('stat-score')!.textContent = scores.length === 1
      ? `P1 ${scores[0]}`
      : scores.map((s, i) => `P${i + 1} ${s}`).join(' ');
    document.getElementById('stat-winner')!.textContent = winner;
  }

  renderPlayerStats(result: SimulationResult | null): void {
    if (!result) {
      this.statsContainer.innerHTML = `<div class="player-stat">
        <div class="player-dot" style="background: ${PLAYER_COLORS[0]}"></div>
        <span class="player-name">P1</span>
        <span class="player-detail">Ready</span>
        <span class="player-score">0</span>
      </div>`;
      return;
    }

    const html = [];
    for (let p = 0; p < this.state.config.playerCount; p++) {
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
    this.statsContainer.innerHTML = html.join('');
  }

  setRunDisabled(disabled: boolean): void {
    this.runBtn.disabled = disabled;
  }

  setPlayDisabled(disabled: boolean): void {
    this.playBtn.disabled = disabled;
  }
}

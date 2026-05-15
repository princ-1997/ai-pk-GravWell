import type { Player } from '../../types';

export interface CodeEditorCallbacks {
  onPlay: () => void;
  onStop: () => void;
  onLoadBaseline: () => void;
  onPlayerRoundSelect: (playerId: number, round: number) => void;
}

export class CodeEditor {
  private el: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private playerSelectorEl: HTMLElement;
  private roundSelectorEl: HTMLSelectElement;
  private progressEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private players: Player[] = [];
  private selectedPlayerId = 0;
  private selectedRound = 0;
  private callbacks: CodeEditorCallbacks;

  constructor(parent: HTMLElement, callbacks: CodeEditorCallbacks) {
    this.callbacks = callbacks;
    this.el = document.createElement('div');
    this.el.className = 'panel-section bot-code-container';
    this.el.innerHTML = `
      <div class="panel-section-title">BOT CODE</div>
      <div class="btn-row" style="margin-top: 0; margin-bottom: 6px;">
        <button class="btn btn-sm" id="btn-play-benchmark">PLAY</button>
        <button class="btn btn-sm btn-outline" id="btn-stop-benchmark" style="display:none;">STOP</button>
        <button class="btn btn-sm btn-outline" id="btn-load-baseline">LOAD BASELINE</button>
      </div>
      <div id="benchmark-progress" style="display:none; font-size: 11px; color: var(--text-dim); margin-bottom: 6px;"></div>
      <div class="player-selector" id="player-selector"></div>
      <div class="round-selector-row" style="margin-bottom: 6px; display:none;">
        <label class="field-label" style="width:auto; margin-right:6px;">ROUND</label>
        <select class="field-input" id="round-selector" style="width:auto; padding:4px 6px;"></select>
      </div>
      <textarea class="bot-code" id="bot-code" spellcheck="false" readonly placeholder="// Bot code will appear here after benchmark starts..."></textarea>
    `;
    parent.appendChild(this.el);

    this.textarea = this.el.querySelector('#bot-code') as HTMLTextAreaElement;
    this.playerSelectorEl = this.el.querySelector('#player-selector') as HTMLElement;
    this.roundSelectorEl = this.el.querySelector('#round-selector') as HTMLSelectElement;
    this.progressEl = this.el.querySelector('#benchmark-progress') as HTMLElement;
    this.playBtn = this.el.querySelector('#btn-play-benchmark') as HTMLButtonElement;
    this.stopBtn = this.el.querySelector('#btn-stop-benchmark') as HTMLButtonElement;

    this.playBtn.addEventListener('click', callbacks.onPlay);
    this.stopBtn.addEventListener('click', callbacks.onStop);
    this.el.querySelector('#btn-load-baseline')!.addEventListener('click', callbacks.onLoadBaseline);

    this.roundSelectorEl.addEventListener('change', () => {
      this.selectedRound = parseInt(this.roundSelectorEl.value);
      this.callbacks.onPlayerRoundSelect(this.selectedPlayerId, this.selectedRound);
    });
  }

  setPlayers(players: Player[]): void {
    this.players = players;
    this.renderPlayerSelector();
  }

  setRounds(roundCount: number): void {
    const row = this.roundSelectorEl.parentElement as HTMLElement;
    if (roundCount === 0) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    this.roundSelectorEl.innerHTML = '';
    for (let i = 0; i < roundCount; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `Round ${i + 1}`;
      this.roundSelectorEl.appendChild(opt);
    }
    this.roundSelectorEl.value = String(this.selectedRound);
  }

  selectRound(round: number): void {
    this.selectedRound = round;
    if (this.roundSelectorEl.querySelector(`option[value="${round}"]`)) {
      this.roundSelectorEl.value = String(round);
    }
  }

  setCode(code: string): void {
    this.textarea.value = code;
  }

  getCode(): string {
    return this.textarea.value;
  }

  setRunning(running: boolean): void {
    this.playBtn.style.display = running ? 'none' : 'inline-block';
    this.stopBtn.style.display = running ? 'inline-block' : 'none';
    this.playBtn.disabled = running;
  }

  setPlayDisabled(disabled: boolean): void {
    this.playBtn.disabled = disabled;
  }

  showProgress(text: string): void {
    this.progressEl.style.display = 'block';
    this.progressEl.textContent = text;
  }

  hideProgress(): void {
    this.progressEl.style.display = 'none';
  }

  private renderPlayerSelector(): void {
    if (this.players.length === 0) {
      this.playerSelectorEl.innerHTML = '';
      return;
    }

    this.playerSelectorEl.innerHTML = this.players.map(p => {
      const isActive = p.id === this.selectedPlayerId;
      return `<button class="player-btn ${isActive ? 'active' : ''}"
        data-player-id="${p.id}"
        style="border-color:${p.color}; ${isActive ? `background:${p.color}22;` : ''}">
        <span class="player-dot" style="background:${p.color}"></span>
        ${p.label}
      </button>`;
    }).join('');

    this.playerSelectorEl.querySelectorAll('.player-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPlayerId = parseInt((btn as HTMLElement).dataset.playerId!);
        this.renderPlayerSelector();
        this.callbacks.onPlayerRoundSelect(this.selectedPlayerId, this.selectedRound);
      });
    });
  }
}

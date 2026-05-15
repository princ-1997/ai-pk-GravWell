import type { AppState, Tab } from '../app';
import type { PlayerRoundData } from '../../types';
import type { DiagnosticReport } from '../../llm/diagnostic';

export class LlmMaterialsTab implements Tab {
  el: HTMLElement;
  private state: AppState;
  private selectedPlayerId = 0;
  private selectedRound = 0;
  private playerSelector!: HTMLElement;
  private roundSelector!: HTMLElement;
  private contentArea!: HTMLElement;

  constructor(state: AppState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div class="materials-layout">
        <div class="materials-header">
          <div class="panel-section-title" style="margin-bottom: 0;">LLM INTERACTION LOG</div>
          <div class="materials-player-selector" id="mat-player-selector"></div>
          <div class="materials-round-selector" id="mat-round-selector"></div>
        </div>
        <div class="materials-content" id="mat-content">
          <div class="materials-empty">No benchmark results yet. Add players and run a benchmark in the Simulator tab.</div>
        </div>
      </div>
    `;
    this.playerSelector = this.el.querySelector('#mat-player-selector') as HTMLElement;
    this.roundSelector = this.el.querySelector('#mat-round-selector') as HTMLElement;
    this.contentArea = this.el.querySelector('#mat-content') as HTMLElement;
  }

  onActivate(): void {
    this.render();
  }

  private render(): void {
    const results = this.state.roundResults;
    const players = this.state.players;

    if (results.length === 0 || players.length === 0) {
      this.playerSelector.innerHTML = '';
      this.roundSelector.innerHTML = '';
      this.contentArea.innerHTML = `<div class="materials-empty">No benchmark results yet. Add players and run a benchmark in the Simulator tab.</div>`;
      return;
    }

    // Clamp selection
    if (!players.find(p => p.id === this.selectedPlayerId)) {
      this.selectedPlayerId = players[0].id;
    }
    if (this.selectedRound >= results.length) {
      this.selectedRound = results.length - 1;
    }

    // Render player selector
    this.playerSelector.innerHTML = players.map(p => {
      const active = p.id === this.selectedPlayerId ? ' active' : '';
      return `<button class="round-btn${active}" data-player-id="${p.id}" style="border-left: 3px solid ${p.color};">P${p.id + 1} ${p.label}</button>`;
    }).join('');

    this.playerSelector.querySelectorAll('.round-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPlayerId = parseInt(btn.getAttribute('data-player-id')!);
        this.render();
      });
    });

    // Render round selector
    this.roundSelector.innerHTML = results.map((_, i) => {
      const active = i === this.selectedRound ? ' active' : '';
      return `<button class="round-btn${active}" data-idx="${i}">R${i + 1}</button>`;
    }).join('');

    this.roundSelector.querySelectorAll('.round-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRound = parseInt(btn.getAttribute('data-idx')!);
        this.render();
      });
    });

    // Find the player's data for the selected round
    const roundResult = results[this.selectedRound];
    const playerData = roundResult.players.find(p => p.playerId === this.selectedPlayerId);

    if (!playerData) {
      this.contentArea.innerHTML = `<div class="materials-empty">No data for this player in round ${this.selectedRound + 1}.</div>`;
      return;
    }

    this.contentArea.innerHTML = this.renderRecord(playerData);
  }

  private renderRecord(record: PlayerRoundData): string {
    const tokenInfo = `${record.tokensUsed.input} input / ${record.tokensUsed.output} output`;
    const diagnosticHtml = this.renderDiagnostic(record.diagnostic);

    return `
      <div class="materials-record">
        <div class="materials-meta">
          <span class="materials-type">Round ${this.selectedRound + 1} — Score: ${record.score}</span>
          <span class="materials-tokens">${tokenInfo} tokens</span>
        </div>

        <div class="materials-section">
          <div class="materials-section-title">SYSTEM PROMPT</div>
          <pre class="materials-pre">${escapeHtml(record.systemPrompt)}</pre>
        </div>

        <div class="materials-section">
          <div class="materials-section-title">USER PROMPT</div>
          <pre class="materials-pre">${escapeHtml(record.userPrompt)}</pre>
        </div>

        <div class="materials-section">
          <div class="materials-section-title">RAW LLM RESPONSE</div>
          <pre class="materials-pre materials-pre-tall">${escapeHtml(record.rawResponse)}</pre>
        </div>

        <div class="materials-section">
          <div class="materials-section-title">EXTRACTED CODE</div>
          <pre class="materials-pre materials-pre-code">${escapeHtml(record.code)}</pre>
        </div>

        <div class="materials-section">
          <div class="materials-section-title">DIAGNOSTIC REPORT</div>
          ${diagnosticHtml}
        </div>
      </div>
    `;
  }

  private renderDiagnostic(diag: DiagnosticReport): string {
    const shipRows = diag.perShip.map(s => {
      const status = s.alive ? 'alive' : `crashed T${s.crashedTick} → ${s.crashedInto}`;
      return `<tr>
        <td>${s.id}</td>
        <td>${status}</td>
        <td>${s.ticksInZone}</td>
        <td>${s.fuelRemaining.toFixed(1)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="materials-diag">
        <div class="materials-diag-summary">${escapeHtml(diag.summary)}</div>
        <div class="materials-diag-stats">
          Score: <strong>${diag.positiveScore}</strong> |
          Best ship: <strong>${diag.bestShipScore}</strong> |
          Ships: ${diag.shipsAlive} alive, ${diag.shipsCrashed} crashed |
          Fuel used: ${diag.totalFuelUsed.toFixed(1)} |
          Zone ticks: ${diag.totalTicksInZone}
        </div>
        <table class="materials-table">
          <thead><tr><th>Ship</th><th>Status</th><th>Zone Ticks</th><th>Fuel Left</th></tr></thead>
          <tbody>${shipRows}</tbody>
        </table>
      </div>
    `;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

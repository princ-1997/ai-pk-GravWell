import type { AppState, LlmMaterialsRecord, Tab } from '../app';

export class LlmMaterialsTab implements Tab {
  el: HTMLElement;
  private state: AppState;
  private selectedRound = 0;
  private roundSelector!: HTMLElement;
  private contentArea!: HTMLElement;

  constructor(state: AppState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div class="materials-layout">
        <div class="materials-header">
          <div class="panel-section-title" style="margin-bottom: 0;">LLM INTERACTION LOG</div>
          <div class="materials-round-selector" id="mat-round-selector"></div>
        </div>
        <div class="materials-content" id="mat-content">
          <div class="materials-empty">No LLM interactions yet. Generate a bot or run iteration in the Simulator tab.</div>
        </div>
      </div>
    `;
    this.roundSelector = this.el.querySelector('#mat-round-selector') as HTMLElement;
    this.contentArea = this.el.querySelector('#mat-content') as HTMLElement;
  }

  onActivate(): void {
    this.render();
  }

  private render(): void {
    const records = this.state.llmMaterials;

    if (records.length === 0) {
      this.roundSelector.innerHTML = '';
      this.contentArea.innerHTML = `<div class="materials-empty">No LLM interactions yet. Generate a bot or run iteration in the Simulator tab.</div>`;
      return;
    }

    // Clamp selected round
    if (this.selectedRound >= records.length) this.selectedRound = records.length - 1;

    // Render round selector buttons
    this.roundSelector.innerHTML = records.map((r, i) => {
      const label = r.type === 'generate' ? 'Gen' : `R${r.round}`;
      const active = i === this.selectedRound ? ' active' : '';
      return `<button class="round-btn${active}" data-idx="${i}">${label}</button>`;
    }).join('');

    this.roundSelector.querySelectorAll('.round-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedRound = parseInt(btn.getAttribute('data-idx')!);
        this.render();
      });
    });

    // Render selected record
    const record = records[this.selectedRound];
    this.contentArea.innerHTML = this.renderRecord(record);
  }

  private renderRecord(record: LlmMaterialsRecord): string {
    const typeLabel = record.type === 'generate'
      ? 'Single Generation'
      : `Iteration Round ${record.round}`;

    const tokenInfo = `${record.tokensUsed.input} input / ${record.tokensUsed.output} output`;

    const diagnosticHtml = record.diagnostic
      ? this.renderDiagnostic(record.diagnostic)
      : '<div class="materials-note">No diagnostic — run a simulation with this bot to generate one.</div>';

    return `
      <div class="materials-record">
        <div class="materials-meta">
          <span class="materials-type">${typeLabel}</span>
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
          <pre class="materials-pre materials-pre-code">${escapeHtml(record.extractedCode)}</pre>
        </div>

        <div class="materials-section">
          <div class="materials-section-title">DIAGNOSTIC REPORT</div>
          ${diagnosticHtml}
        </div>
      </div>
    `;
  }

  private renderDiagnostic(diag: LlmMaterialsRecord['diagnostic']): string {
    if (!diag) return '';

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

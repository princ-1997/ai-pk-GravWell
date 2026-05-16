import type { SimulatorRunRecord } from '../../types';
import type { AppState, Tab } from '../app';
import { getAllSimulatorRuns, deleteSimulatorRun, deleteAllSimulatorRuns } from '../../persistence/simulator-store';

export class DatabaseTab implements Tab {
  el: HTMLElement;
  private state: AppState;

  private tableBody!: HTMLElement;
  private statusEl!: HTMLElement;
  private clearAllBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;
  private codeModal!: HTMLElement;
  private codeModalPre!: HTMLElement;

  constructor(state: AppState) {
    this.state = state;
    this.el = document.createElement('div');
    this.buildLayout();
  }

  async onActivate(): Promise<void> {
    await this.loadRuns();
  }

  onDeactivate(): void {}

  // ====== Layout ======

  private buildLayout(): void {
    this.el.innerHTML = `
      <div class="db-layout">
        <div class="db-toolbar panel-section">
          <div class="panel-section-title">SIMULATOR RUN HISTORY</div>
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn" id="db-refresh">REFRESH</button>
            <button class="btn btn-outline" id="db-clear-all" style="font-size:10px;">CLEAR ALL</button>
          </div>
          <div id="db-status" class="lb-status" style="margin-top:6px;"></div>
        </div>

        <div class="db-table-wrap">
          <table class="db-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Seed</th>
                <th>Best Score</th>
                <th>Best Round</th>
                <th>Rounds</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="db-tbody"></tbody>
          </table>
        </div>

        <div id="db-code-modal" class="db-code-modal" style="display:none;">
          <div class="db-code-modal-inner">
            <div class="db-code-modal-header">
              <span id="db-code-modal-title">Code</span>
              <button id="db-code-modal-close" class="btn btn-outline" style="font-size:10px;padding:2px 8px;">CLOSE</button>
            </div>
            <pre id="db-code-pre" class="db-code-pre"></pre>
          </div>
        </div>
      </div>
    `;

    this.tableBody = this.el.querySelector('#db-tbody')!;
    this.statusEl = this.el.querySelector('#db-status')!;
    this.clearAllBtn = this.el.querySelector('#db-clear-all') as HTMLButtonElement;
    this.refreshBtn = this.el.querySelector('#db-refresh') as HTMLButtonElement;
    this.codeModal = this.el.querySelector('#db-code-modal')!;
    this.codeModalPre = this.el.querySelector('#db-code-pre')!;

    this.refreshBtn.addEventListener('click', () => this.loadRuns());
    this.clearAllBtn.addEventListener('click', () => this.clearAll());
    this.el.querySelector('#db-code-modal-close')!.addEventListener('click', () => this.closeModal());
    this.codeModal.addEventListener('click', (e) => {
      if (e.target === this.codeModal) this.closeModal();
    });
  }

  // ====== Data Loading ======

  private async loadRuns(): Promise<void> {
    this.statusEl.textContent = 'Loading...';
    try {
      const runs = await getAllSimulatorRuns();
      this.renderTable(runs);
      this.statusEl.textContent = runs.length === 0 ? '' : `${runs.length} run${runs.length !== 1 ? 's' : ''} stored.`;
    } catch (e) {
      this.statusEl.innerHTML = `<span style="color:var(--red);">Failed to load: ${e}</span>`;
    }
  }

  // ====== Table Rendering ======

  private renderTable(runs: SimulatorRunRecord[]): void {
    if (runs.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">
            No runs yet. Complete a benchmark in the SIMULATOR tab.
          </td>
        </tr>`;
      return;
    }

    this.tableBody.innerHTML = runs.map(run => this.renderRow(run)).join('');

    // Wire expand + delete buttons
    this.tableBody.querySelectorAll<HTMLButtonElement>('.db-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id!);
        this.toggleExpand(id, runs);
      });
    });

    this.tableBody.querySelectorAll<HTMLButtonElement>('.db-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id!);
        if (!confirm('Delete this run?')) return;
        await deleteSimulatorRun(id);
        // Also clear from in-memory playerCache if it matches
        const run = runs.find(r => r.id === id);
        if (run) this.state.playerCache.delete(run.cacheKey);
        await this.loadRuns();
      });
    });
  }

  private renderRow(run: SimulatorRunRecord): string {
    const date = new Date(run.timestamp).toLocaleString();
    const modelShort = run.model.length > 24 ? run.model.slice(0, 22) + '..' : run.model;
    const providerShort = run.provider === 'baseline' ? 'built-in' : run.provider;
    return `
      <tr class="db-run-row" data-run-id="${run.id}">
        <td style="font-size:10px; color:var(--text-dim);">${date}</td>
        <td title="${run.model}">${modelShort}</td>
        <td>${providerShort}</td>
        <td>${run.seed}</td>
        <td style="color:var(--gold); font-weight:bold;">${run.bestScore}</td>
        <td>R${run.bestRound}</td>
        <td>${run.rounds.length}</td>
        <td>
          <button class="btn btn-outline db-expand-btn" data-id="${run.id}" style="font-size:9px;padding:1px 6px;">ROUNDS</button>
          <button class="btn btn-outline db-delete-btn" data-id="${run.id}" style="font-size:9px;padding:1px 6px; margin-left:4px; color:var(--red);">DEL</button>
        </td>
      </tr>
      <tr class="db-detail-row" id="db-detail-${run.id}" style="display:none;">
        <td colspan="8">
          ${this.renderRoundsDetail(run)}
        </td>
      </tr>`;
  }

  private renderRoundsDetail(run: SimulatorRunRecord): string {
    const rows = run.rounds.map((r, i) => {
      const isBest = (i + 1) === run.bestRound;
      const cls = isBest ? 'style="color:var(--gold);"' : '';
      return `
        <tr>
          <td ${cls}>R${i + 1}${isBest ? ' ★' : ''}</td>
          <td ${cls}>${r.score}</td>
          <td><button class="btn btn-outline db-view-code-btn" data-run-id="${run.id}" data-round="${i}" style="font-size:9px;padding:1px 6px;">VIEW CODE</button></td>
        </tr>`;
    }).join('');

    return `
      <div style="padding: 8px 12px; background: rgba(0,0,0,0.3); border-top: 1px solid var(--border);">
        <table style="font-size:11px; width:auto;">
          <thead><tr><th style="padding-right:16px;">Round</th><th style="padding-right:16px;">Score</th><th>Code</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  private toggleExpand(runId: number, runs: SimulatorRunRecord[]): void {
    const detailRow = this.tableBody.querySelector(`#db-detail-${runId}`) as HTMLElement;
    if (!detailRow) return;

    const isOpen = detailRow.style.display !== 'none';
    detailRow.style.display = isOpen ? 'none' : 'table-row';

    if (!isOpen) {
      // Wire view-code buttons inside the newly shown detail row
      const run = runs.find(r => r.id === runId);
      if (!run) return;
      detailRow.querySelectorAll<HTMLButtonElement>('.db-view-code-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const round = parseInt(btn.dataset.round!);
          this.showCode(run, round);
        });
      });
    }
  }

  // ====== Code Modal ======

  private showCode(run: SimulatorRunRecord, roundIdx: number): void {
    const round = run.rounds[roundIdx];
    if (!round) return;
    const titleEl = this.el.querySelector('#db-code-modal-title')!;
    titleEl.textContent = `${run.model} — Seed ${run.seed} — Round ${roundIdx + 1} (score: ${round.score})`;
    this.codeModalPre.textContent = round.code;
    this.codeModal.style.display = 'flex';
  }

  private closeModal(): void {
    this.codeModal.style.display = 'none';
  }

  // ====== Clear All ======

  private async clearAll(): Promise<void> {
    if (!confirm('Delete all simulator run history? This also clears the in-memory cache.')) return;
    await deleteAllSimulatorRuns();
    this.state.playerCache.clear();
    this.statusEl.innerHTML = `<span style="color:var(--text-dim);">All runs deleted.</span>`;
    await this.loadRuns();
  }
}

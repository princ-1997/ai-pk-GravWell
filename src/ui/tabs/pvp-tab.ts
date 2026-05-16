import type { AppState } from '../app';
import type { Tab } from '../app';
import type { PvpBot, PvpMatchRecord, Sun, TickRecord } from '../../types';
import { DEFAULT_CONFIG, INITIAL_ELO, PLAYER_COLORS } from '../../constants';
import { generateArena } from '../../core/arena';
import { getBestCodePerModel, runFairMatch } from '../../modes/pvp';
import { tallyRecords } from '../../modes/elo';
import {
  addBot, addMatch, clearAllBots, clearAllMatches,
  deleteBot, getAllBots, getAllMatches, resetAllElo, updateBot,
} from '../../persistence/pvp-store';
import { GameRenderer } from '../../renderer/game-renderer';

export class PvpTab implements Tab {
  el: HTMLElement;
  private _state: AppState;

  private bots: PvpBot[] = [];
  private matches: PvpMatchRecord[] = [];
  private selectedMatch: PvpMatchRecord | null = null;
  private selectedRotation = 0;
  private matchRunning = false;

  // Replay
  private replayTicks: TickRecord[] = [];
  private replayIndex = 0;
  private replayPlaying = false;
  private replaySpeed = 1;
  private replayAF: number | null = null;
  private renderer: GameRenderer | null = null;
  private replaySuns: ReadonlyArray<Sun> = [];
  private lastFrameTime = 0;
  private ticksPerMs = 200 / 8000; // 200 ticks in ~8s at speed 1

  // DOM refs
  private rosterTbody!: HTMLElement;
  private importPanel!: HTMLElement;
  private importList!: HTMLElement;
  private statusEl!: HTMLElement;
  private matchStatusEl!: HTMLElement;
  private setupList!: HTMLElement;
  private seedInput!: HTMLInputElement;
  private runBtn!: HTMLButtonElement;
  private resultsSection!: HTMLElement;
  private resultsTbody!: HTMLElement;
  private resultsSummary!: HTMLElement;
  private historySection!: HTMLElement;
  private historyTbody!: HTMLElement;
  private replaySection!: HTMLElement;
  private replayCanvas!: HTMLCanvasElement;
  private rotationBar!: HTMLElement;
  private tickSlider!: HTMLInputElement;
  private playBtn!: HTMLButtonElement;
  private speedSlider!: HTMLInputElement;
  private rotationLabel!: HTMLElement;
  private replayPositionLabel!: HTMLElement;

  constructor(state: AppState) {
    this._state = state;
    this.el = document.createElement('div');
    this.el.className = 'pvp-tab-root';
    this.buildLayout();
    this.wireEvents();
  }

  async onActivate() {
    await this.refreshRoster();
    await this.refreshHistory();
  }

  onDeactivate() {
    this.stopReplay();
  }

  // ====== Layout ======

  private buildLayout() {
    this.el.innerHTML = `
      <div class="pvp-layout">

        <!-- LEFT: Roster + Setup -->
        <div class="pvp-left">

          <!-- Bot Roster -->
          <div class="panel-section">
            <div class="panel-section-title">BOT ROSTER</div>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn btn-outline" id="pvp-import-btn" style="font-size:11px;">IMPORT FROM LEADERBOARD</button>
              <button class="btn btn-outline" id="pvp-reset-elo-btn" style="font-size:10px; color:var(--text-dim);">RESET ELO</button>
              <button class="btn btn-outline" id="pvp-clear-roster-btn" style="font-size:10px; color:var(--red);">CLEAR ALL</button>
            </div>
            <div id="pvp-status" class="lb-status" style="margin-top:6px; font-size:11px;"></div>

            <!-- Import panel (hidden by default) -->
            <div id="pvp-import-panel" style="display:none; margin-top:8px; border:1px solid var(--border); padding:8px; background:var(--bg-panel-alt);">
              <div style="font-size:10px; color:var(--text-dim); margin-bottom:6px;">Models available in leaderboard (best code per model):</div>
              <div id="pvp-import-list" style="max-height:200px; overflow-y:auto;"></div>
              <div style="margin-top:6px;">
                <button class="btn btn-outline" id="pvp-import-close" style="font-size:10px;">CLOSE</button>
              </div>
            </div>

            <div style="margin-top:10px; overflow-x:auto;">
              <table class="lb-ranking-table" style="width:100%;">
                <thead>
                  <tr>
                    <th style="text-align:left;">Name</th>
                    <th>Elo</th>
                    <th>W</th>
                    <th>L</th>
                    <th>D</th>
                    <th>M</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="pvp-roster-tbody">
                  <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:16px;">No bots yet — import from LEADERBOARD</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Match Setup -->
          <div class="panel-section" style="margin-top:12px;">
            <div class="panel-section-title">MATCH SETUP</div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:4px;">Select 2–4 bots:</div>
            <div id="pvp-setup-list" style="margin-top:6px; max-height:160px; overflow-y:auto;"></div>
            <div class="btn-row" style="margin-top:8px; align-items:center;">
              <span style="font-size:11px; color:var(--text-dim);">Seed:</span>
              <input id="pvp-seed" type="number" value="9001" min="1" max="99999" class="field-input" style="width:70px; font-size:12px; text-align:center;" />
              <button class="btn btn-outline" id="pvp-seed-random" style="font-size:10px; padding:2px 8px;">🎲</button>
            </div>
            <div style="margin-top:8px;">
              <button class="btn" id="pvp-run-btn" disabled style="width:100%; font-size:13px;">▶ RUN MATCH</button>
            </div>
            <div id="pvp-match-status" class="lb-status" style="margin-top:6px; font-size:11px;"></div>
          </div>

        </div>

        <!-- RIGHT: Results + History + Replay -->
        <div class="pvp-right">

          <!-- Latest Match Results -->
          <div id="pvp-results-section" class="panel-section" style="display:none;">
            <div class="panel-section-title">LATEST MATCH RESULTS</div>
            <div id="pvp-results-summary" style="font-size:11px; color:var(--text-dim); margin-top:4px;"></div>
            <div style="overflow-x:auto; margin-top:8px;">
              <table class="lb-ranking-table" style="width:100%;">
                <thead><tr id="pvp-results-header"></tr></thead>
                <tbody id="pvp-results-tbody"></tbody>
              </table>
            </div>
            <div style="margin-top:8px;">
              <button class="btn btn-outline" id="pvp-view-replay-btn" style="font-size:11px;">VIEW REPLAY ▼</button>
            </div>
          </div>

          <!-- Match History -->
          <div id="pvp-history-section" class="panel-section" style="margin-top:12px;">
            <div class="panel-section-title">MATCH HISTORY</div>
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-outline" id="pvp-clear-matches-btn" style="font-size:10px; color:var(--red);">CLEAR HISTORY</button>
            </div>
            <div style="overflow-x:auto; margin-top:8px;">
              <table class="lb-ranking-table" style="width:100%;">
                <thead>
                  <tr>
                    <th style="text-align:left;">Date</th>
                    <th style="text-align:left;">Bots</th>
                    <th>Seed</th>
                    <th style="text-align:left;">Winner</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="pvp-history-tbody">
                  <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">No matches yet</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Replay Viewer -->
          <div id="pvp-replay-section" class="panel-section" style="margin-top:12px; display:none;">
            <div class="panel-section-title">REPLAY VIEWER</div>
            <div id="pvp-rotation-bar" class="btn-row" style="margin-top:6px; flex-wrap:wrap; gap:4px;"></div>
            <div id="pvp-rotation-label" style="font-size:10px; color:var(--text-dim); margin-top:4px; min-height:14px;"></div>
            <div class="canvas-container" style="margin-top:8px; width:100%; aspect-ratio:1;">
              <canvas id="pvp-canvas"></canvas>
            </div>
            <div id="pvp-replay-pos-label" style="font-size:10px; color:var(--text-dim); margin-top:4px; min-height:14px;"></div>
            <div class="btn-row" style="margin-top:8px; align-items:center; flex-wrap:wrap; gap:8px;">
              <button class="btn" id="pvp-play-btn" style="font-size:11px; min-width:60px;">▶ PLAY</button>
              <div style="display:flex; align-items:center; gap:4px; flex:1; min-width:120px;">
                <span style="font-size:10px; color:var(--text-dim);">Tick:</span>
                <input type="range" id="pvp-tick-slider" min="0" max="199" value="0" style="flex:1;" />
                <span id="pvp-tick-label" style="font-size:10px; color:var(--text-dim); min-width:36px; text-align:right;">0/200</span>
              </div>
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-size:10px; color:var(--text-dim);">Speed:</span>
                <input type="range" id="pvp-speed-slider" min="1" max="8" value="2" step="1" style="width:60px;" />
                <span id="pvp-speed-label" style="font-size:10px; color:var(--text-dim); min-width:28px;">1×</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    this.rosterTbody = this.el.querySelector('#pvp-roster-tbody')!;
    this.importPanel = this.el.querySelector('#pvp-import-panel')!;
    this.importList = this.el.querySelector('#pvp-import-list')!;
    this.statusEl = this.el.querySelector('#pvp-status')!;
    this.matchStatusEl = this.el.querySelector('#pvp-match-status')!;
    this.setupList = this.el.querySelector('#pvp-setup-list')!;
    this.seedInput = this.el.querySelector('#pvp-seed')!;
    this.runBtn = this.el.querySelector('#pvp-run-btn')!;
    this.resultsSection = this.el.querySelector('#pvp-results-section')!;
    this.resultsTbody = this.el.querySelector('#pvp-results-tbody')!;
    this.resultsSummary = this.el.querySelector('#pvp-results-summary')!;
    this.historySection = this.el.querySelector('#pvp-history-section')!;
    this.historyTbody = this.el.querySelector('#pvp-history-tbody')!;
    this.replaySection = this.el.querySelector('#pvp-replay-section')!;
    this.replayCanvas = this.el.querySelector('#pvp-canvas')!;
    this.rotationBar = this.el.querySelector('#pvp-rotation-bar')!;
    this.tickSlider = this.el.querySelector('#pvp-tick-slider')!;
    this.playBtn = this.el.querySelector('#pvp-play-btn')!;
    this.speedSlider = this.el.querySelector('#pvp-speed-slider')!;
    this.rotationLabel = this.el.querySelector('#pvp-rotation-label')!;
    this.replayPositionLabel = this.el.querySelector('#pvp-replay-pos-label')!;
  }

  // ====== Event Wiring ======

  private wireEvents() {
    this.el.querySelector('#pvp-import-btn')!.addEventListener('click', () => this.openImportPanel());
    this.el.querySelector('#pvp-import-close')!.addEventListener('click', () => this.closeImportPanel());
    this.el.querySelector('#pvp-reset-elo-btn')!.addEventListener('click', () => this.handleResetElo());
    this.el.querySelector('#pvp-clear-roster-btn')!.addEventListener('click', () => this.handleClearRoster());
    this.el.querySelector('#pvp-seed-random')!.addEventListener('click', () => {
      this.seedInput.value = String(Math.floor(Math.random() * 99999) + 1);
    });
    this.el.querySelector('#pvp-clear-matches-btn')!.addEventListener('click', () => this.handleClearMatches());
    this.runBtn.addEventListener('click', () => this.handleRunMatch());
    this.el.querySelector('#pvp-view-replay-btn')!.addEventListener('click', () => {
      this.replaySection.style.display = 'block';
      this.replaySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Replay controls
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.tickSlider.addEventListener('input', () => {
      this.stopReplay();
      this.replayIndex = parseInt(this.tickSlider.value);
      this.renderFrame(this.replayIndex);
    });
    this.speedSlider.addEventListener('input', () => {
      const sp = parseInt(this.speedSlider.value);
      this.replaySpeed = sp;
      const speedLabels = ['','0.5×','1×','2×','3×','4×','5×','6×','8×'];
      const lbl = this.el.querySelector('#pvp-speed-label') as HTMLElement;
      if (lbl) lbl.textContent = speedLabels[sp] ?? `${sp}×`;
    });
  }

  // ====== Roster ======

  private async refreshRoster() {
    this.bots = await getAllBots();
    this.renderRoster();
    this.renderSetupList();
    this.updateRunBtn();
  }

  private renderRoster() {
    if (this.bots.length === 0) {
      this.rosterTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:16px;">No bots yet — import from LEADERBOARD</td></tr>`;
      return;
    }
    this.rosterTbody.innerHTML = this.bots.map(bot => {
      const colorDot = bot.id != null
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${this.botColor(bot.id)};margin-right:4px;"></span>`
        : '';
      const name = this.escHtml(bot.name);
      const model = this.escHtml(bot.model.split('/').pop() ?? bot.model);
      return `
        <tr>
          <td style="font-size:11px;">${colorDot}<span title="${this.escHtml(bot.name)}">${name.length > 22 ? name.slice(0,20)+'…' : name}</span><br>
            <span style="font-size:9px;color:var(--text-muted);">${model}</span>
          </td>
          <td style="color:var(--gold); font-weight:bold; text-align:center;">${Math.round(bot.elo)}</td>
          <td style="color:var(--green); text-align:center;">${bot.wins}</td>
          <td style="color:var(--red); text-align:center;">${bot.losses}</td>
          <td style="text-align:center;">${bot.draws}</td>
          <td style="color:var(--text-dim); text-align:center;">${bot.matches}</td>
          <td><button class="btn btn-outline pvp-del-bot" data-id="${bot.id}" style="font-size:9px;padding:1px 6px;color:var(--red);">DEL</button></td>
        </tr>`;
    }).join('');

    this.rosterTbody.querySelectorAll('.pvp-del-bot').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt((btn as HTMLElement).dataset.id ?? '0');
        this.handleDeleteBot(id);
      });
    });
  }

  private renderSetupList() {
    if (this.bots.length === 0) {
      this.setupList.innerHTML = `<div style="color:var(--text-muted); font-size:11px; padding:4px;">Add bots to roster first.</div>`;
      return;
    }
    this.setupList.innerHTML = this.bots.map(bot => {
      const colorDot = bot.id != null
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${this.botColor(bot.id)};margin-right:4px; vertical-align:middle;"></span>`
        : '';
      const name = this.escHtml(bot.name);
      return `
        <label style="display:flex; align-items:center; gap:4px; font-size:11px; padding:2px 0; cursor:pointer;">
          <input type="checkbox" class="pvp-bot-check" data-id="${bot.id}" style="cursor:pointer;" />
          ${colorDot}${name.length > 30 ? name.slice(0,28)+'…' : name}
        </label>`;
    }).join('');

    this.setupList.querySelectorAll('.pvp-bot-check').forEach(cb => {
      cb.addEventListener('change', () => this.updateRunBtn());
    });
  }

  private getSelectedBotIds(): number[] {
    return Array.from(this.setupList.querySelectorAll('.pvp-bot-check:checked'))
      .map(el => parseInt((el as HTMLElement).dataset.id ?? '0'))
      .filter(id => !isNaN(id));
  }

  private updateRunBtn() {
    const n = this.getSelectedBotIds().length;
    const valid = n >= 2 && n <= 4 && !this.matchRunning;
    this.runBtn.disabled = !valid;
    const label = this.el.querySelector('#pvp-match-status') as HTMLElement;
    if (n < 2) {
      label.innerHTML = `<span style="color:var(--text-muted);">Select 2–4 bots to run a match.</span>`;
    } else if (n > 4) {
      label.innerHTML = `<span style="color:var(--red);">Max 4 bots per match.</span>`;
    } else {
      label.innerHTML = `<span style="color:var(--text-dim);">${n} bots selected → ${n} position rotations.</span>`;
    }
  }

  private botColor(id: number): string {
    return PLAYER_COLORS[id % PLAYER_COLORS.length];
  }

  // ====== Import Panel ======

  private async openImportPanel() {
    this.importPanel.style.display = 'block';
    this.importList.innerHTML = `<div style="color:var(--text-dim); font-size:11px;">Scanning leaderboard…</div>`;
    try {
      const candidates = await getBestCodePerModel();
      if (candidates.length === 0) {
        this.importList.innerHTML = `<div style="color:var(--text-muted); font-size:11px;">No leaderboard data found. Run the LEADERBOARD tab first.</div>`;
        return;
      }
      const existingModels = new Set(this.bots.map(b => b.model));
      this.importList.innerHTML = candidates.map(c => {
        const already = existingModels.has(c.model);
        const name = this.escHtml(c.model.split('/').pop() ?? c.model);
        const fullName = this.escHtml(c.model);
        return `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border);">
            <div>
              <span style="font-size:11px;" title="${fullName}">${name}</span>
              <span style="font-size:10px; color:var(--text-dim);"> — best: </span>
              <span style="font-size:11px; color:var(--gold);">${c.bestScore}</span>
              <span style="font-size:9px; color:var(--text-muted);">pts (S${c.sourceSeed} R${c.sourceRound})</span>
            </div>
            <button class="btn btn-outline pvp-add-candidate" data-model="${this.escHtml(c.model)}"
              style="font-size:10px; padding:2px 8px; ${already ? 'opacity:0.4;' : ''}"
              ${already ? 'disabled title="Already in roster"' : ''}>
              ${already ? 'ADDED' : 'ADD'}
            </button>
          </div>`;
      }).join('');

      // Wire ADD buttons
      this.importList.querySelectorAll('.pvp-add-candidate').forEach(btn => {
        btn.addEventListener('click', async () => {
          const model = (btn as HTMLElement).dataset.model ?? '';
          const candidate = candidates.find(c => c.model === model);
          if (!candidate) return;

          const shortName = model.split('/').pop() ?? model;
          const botName = `${shortName} (S${candidate.sourceSeed}R${candidate.sourceRound} ${candidate.bestScore}pt)`;
          const newBot: PvpBot = {
            name: botName,
            model: candidate.model,
            provider: candidate.provider,
            code: candidate.code,
            sourceSeed: candidate.sourceSeed,
            sourceRound: candidate.sourceRound,
            sourceScore: candidate.bestScore,
            elo: INITIAL_ELO,
            wins: 0,
            losses: 0,
            draws: 0,
            matches: 0,
            createdAt: Date.now(),
          };
          await addBot(newBot);
          this.setStatus(`Added ${botName}.`);
          await this.refreshRoster();
          // Reopen to refresh ADDED state
          await this.openImportPanel();
        });
      });
    } catch (e) {
      this.importList.innerHTML = `<div style="color:var(--red); font-size:11px;">Error: ${e}</div>`;
    }
  }

  private closeImportPanel() {
    this.importPanel.style.display = 'none';
  }

  // ====== Bot Actions ======

  private async handleDeleteBot(id: number) {
    await deleteBot(id);
    await this.refreshRoster();
    this.setStatus('Bot removed.');
  }

  private async handleResetElo() {
    if (!confirm('Reset all Elo ratings to 1500 and clear W/L/D?')) return;
    await resetAllElo(INITIAL_ELO);
    await this.refreshRoster();
    this.setStatus('Elo reset to 1500 for all bots.');
  }

  private async handleClearRoster() {
    if (!confirm('Remove all bots from roster?')) return;
    await clearAllBots();
    await this.refreshRoster();
    this.setStatus('Roster cleared.');
  }

  // ====== Match Runner ======

  private async handleRunMatch() {
    const selectedIds = this.getSelectedBotIds();
    if (selectedIds.length < 2 || selectedIds.length > 4) return;

    const bots = selectedIds.map(id => this.bots.find(b => b.id === id)).filter(Boolean) as PvpBot[];
    const seed = parseInt(this.seedInput.value) || 9001;
    const N = bots.length;

    this.matchRunning = true;
    this.runBtn.disabled = true;
    this.matchStatusEl.innerHTML = `<span style="color:var(--text-dim);">Running ${N} rotations… (seed ${seed})</span>`;

    // Yield to allow UI repaint, then run synchronously
    await new Promise(r => setTimeout(r, 20));

    try {
      const result = runFairMatch(bots, seed, DEFAULT_CONFIG);

      // Build match record
      const eloBefore = bots.map(b => b.elo);
      const eloAfter = bots.map((b, i) => b.elo + result.eloChanges[i]);
      const records = tallyRecords(result.avgScores);

      const matchRecord: PvpMatchRecord = {
        timestamp: Date.now(),
        seed,
        botIds: bots.map(b => b.id!),
        botNamesSnapshot: bots.map(b => b.name),
        perRotationScores: result.perRotationScores,
        avgScores: result.avgScores,
        rank: result.rank,
        eloBefore,
        eloAfter,
        ticksPerRotation: result.ticksPerRotation,
      };
      const matchId = await addMatch(matchRecord);
      matchRecord.id = matchId;

      // Update each bot's Elo and record
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        const updated: PvpBot = {
          ...bot,
          elo: eloAfter[i],
          wins: bot.wins + records[i].wins,
          losses: bot.losses + records[i].losses,
          draws: bot.draws + records[i].draws,
          matches: bot.matches + 1,
        };
        await updateBot(updated);
      }

      await this.refreshRoster();
      await this.refreshHistory();
      this.showResults(matchRecord, bots);
      this.loadMatchForReplay(matchRecord, bots);

      this.matchStatusEl.innerHTML = `<span style="color:var(--green);">Match complete — ${N} rotations, seed ${seed}.</span>`;
    } catch (e) {
      this.matchStatusEl.innerHTML = `<span style="color:var(--red);">Error: ${e}</span>`;
    } finally {
      this.matchRunning = false;
      this.updateRunBtn();
    }
  }

  // ====== Results Display ======

  private showResults(match: PvpMatchRecord, bots: PvpBot[]) {
    this.resultsSection.style.display = 'block';
    const N = bots.length;

    const winnerIdx = match.rank[0];
    const winnerName = bots[winnerIdx]?.name ?? match.botNamesSnapshot[winnerIdx];

    this.resultsSummary.innerHTML =
      `Seed <b>${match.seed}</b> · ${N} bots · ${N} rotations · ` +
      `Winner: <span style="color:var(--gold);">${this.escHtml(winnerName)}</span>`;

    // Header
    const header = this.el.querySelector('#pvp-results-header')!;
    const rotCols = Array.from({ length: N }, (_, k) => `<th>R${k + 1}</th>`).join('');
    header.innerHTML = `<th style="text-align:left;">Bot</th>${rotCols}<th>Avg</th><th>Elo Δ</th>`;

    // Rows sorted by rank
    this.resultsTbody.innerHTML = match.rank.map((botIdx, rankPos) => {
      const bot = bots[botIdx];
      const name = bot?.name ?? match.botNamesSnapshot[botIdx];
      const rotScores = match.perRotationScores.map(rot => Math.round(rot[botIdx])).join('</td><td>');
      const avg = match.avgScores[botIdx].toFixed(1);
      const delta = match.eloAfter[botIdx] - match.eloBefore[botIdx];
      const deltaStr = delta >= 0 ? `+${Math.round(delta)}` : `${Math.round(delta)}`;
      const deltaColor = delta >= 0 ? 'var(--green)' : 'var(--red)';
      const medal = rankPos === 0 ? '🥇 ' : rankPos === 1 ? '🥈 ' : rankPos === 2 ? '🥉 ' : '';
      return `<tr>
        <td style="font-size:11px;">${medal}${this.escHtml(name.length > 20 ? name.slice(0,18)+'…' : name)}</td>
        <td>${rotScores}</td>
        <td style="color:var(--gold); font-weight:bold;">${avg}</td>
        <td style="color:${deltaColor};">${deltaStr}</td>
      </tr>`;
    }).join('');
  }

  // ====== History ======

  private async refreshHistory() {
    this.matches = await getAllMatches();
    this.renderHistory();
  }

  private renderHistory() {
    if (this.matches.length === 0) {
      this.historyTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">No matches yet</td></tr>`;
      return;
    }
    this.historyTbody.innerHTML = this.matches.map(m => {
      const date = new Date(m.timestamp).toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const winnerName = m.botNamesSnapshot[m.rank[0]] ?? '?';
      const botCount = m.botNamesSnapshot.length;
      const delta = Math.round(m.eloAfter[m.rank[0]] - m.eloBefore[m.rank[0]]);
      const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
      const shortNames = m.botNamesSnapshot.map(n => n.split('(')[0].trim().split('/').pop() ?? n).join(' vs ');
      return `
        <tr class="pvp-history-row" data-id="${m.id}" style="cursor:pointer;" title="Click to load replay">
          <td style="font-size:10px; color:var(--text-dim);">${date}</td>
          <td style="font-size:10px;">${this.escHtml(shortNames)}</td>
          <td style="text-align:center; font-size:10px; color:var(--text-dim);">${m.seed}</td>
          <td style="font-size:10px; color:var(--gold);">${this.escHtml(winnerName.split('(')[0].trim())} <span style="color:var(--green);">(${deltaStr})</span></td>
          <td><button class="btn btn-outline pvp-watch-btn" data-id="${m.id}" style="font-size:9px;padding:1px 6px;">WATCH</button></td>
        </tr>`;
    }).join('');

    this.historyTbody.querySelectorAll('.pvp-watch-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt((btn as HTMLElement).dataset.id ?? '0');
        const match = this.matches.find(m => m.id === id);
        if (match) {
          // Reconstruct best-effort bot list from snapshot names (no code needed for display)
          const fakeBots = match.botNamesSnapshot.map((name, i) => ({
            id: match.botIds[i],
            name,
            model: name,
            provider: '',
            code: '',
            sourceSeed: 0,
            sourceRound: 0,
            sourceScore: 0,
            elo: match.eloBefore[i],
            wins: 0, losses: 0, draws: 0, matches: 0,
            createdAt: 0,
          } as PvpBot));
          this.loadMatchForReplay(match, fakeBots);
          this.replaySection.style.display = 'block';
          this.replaySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

  private async handleClearMatches() {
    if (!confirm('Clear all match history?')) return;
    await clearAllMatches();
    await this.refreshHistory();
  }

  // ====== Replay ======

  private loadMatchForReplay(match: PvpMatchRecord, bots: PvpBot[]) {
    this.stopReplay();
    this.selectedMatch = match;
    this.selectedRotation = 0;

    // Re-generate arena to get suns (deterministic from seed)
    const config = { ...DEFAULT_CONFIG, seed: match.seed, playerCount: bots.length };
    const arena = generateArena(config);
    this.replaySuns = arena.suns;

    this.buildRotationButtons(match, bots);
    this.loadRotation(0, match, bots);

    this.replaySection.style.display = 'block';
  }

  private buildRotationButtons(match: PvpMatchRecord, bots: PvpBot[]) {
    const N = bots.length;
    this.rotationBar.innerHTML = Array.from({ length: N }, (_, k) =>
      `<button class="btn btn-outline pvp-rot-btn ${k === 0 ? 'lb-mode-btn--active' : ''}"
        data-rot="${k}" style="font-size:11px; padding:2px 10px;">Rotation ${k + 1}</button>`
    ).join('');

    this.rotationBar.querySelectorAll('.pvp-rot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = parseInt((btn as HTMLElement).dataset.rot ?? '0');
        this.rotationBar.querySelectorAll('.pvp-rot-btn').forEach(b => b.classList.remove('lb-mode-btn--active'));
        btn.classList.add('lb-mode-btn--active');
        this.stopReplay();
        this.loadRotation(k, match, bots);
      });
    });
  }

  private loadRotation(k: number, match: PvpMatchRecord, bots: PvpBot[]) {
    this.selectedRotation = k;
    this.replayTicks = match.ticksPerRotation[k] ?? [];
    this.replayIndex = 0;

    const N = bots.length;
    const tickSliderMax = Math.max(0, this.replayTicks.length - 1);
    this.tickSlider.max = String(tickSliderMax);
    this.tickSlider.value = '0';
    (this.el.querySelector('#pvp-tick-label') as HTMLElement).textContent = `0/${this.replayTicks.length}`;

    // Build rotation label: "Bot A → Slot 1, Bot B → Slot 2, …"
    const assignments = bots.map((bot, i) => {
      const slot = (i + k) % N;
      const color = this.botColor(bot.id ?? i);
      return `<span style="color:${color};">${this.escHtml(bot.name.split('(')[0].trim())}</span> → P${slot + 1}`;
    }).join(' · ');
    this.rotationLabel.innerHTML = assignments;

    // Score line
    const rotScores = match.perRotationScores[k] ?? [];
    const scoreText = bots.map((bot, i) => {
      const color = this.botColor(bot.id ?? i);
      return `<span style="color:${color};">${Math.round(rotScores[i] ?? 0)}</span>`;
    }).join(' / ');
    this.replayPositionLabel.innerHTML = `Scores this rotation: ${scoreText}`;

    // Init renderer
    if (!this.renderer) {
      this.renderer = new GameRenderer(this.replayCanvas);
    }
    this.renderer.resize();
    this.renderer.clearTrails();
    if (this.replayTicks.length > 0) {
      this.renderFrame(0);
    }
  }

  private renderFrame(idx: number) {
    if (!this.renderer || this.replayTicks.length === 0) return;
    const tick = this.replayTicks[Math.min(idx, this.replayTicks.length - 1)];
    this.renderer.renderFrame(tick, this.replaySuns);
    this.tickSlider.value = String(idx);
    (this.el.querySelector('#pvp-tick-label') as HTMLElement).textContent =
      `${idx}/${this.replayTicks.length}`;
  }

  private togglePlay() {
    if (this.replayPlaying) {
      this.stopReplay();
    } else {
      this.startReplay();
    }
  }

  private startReplay() {
    if (this.replayTicks.length === 0) return;
    if (this.replayIndex >= this.replayTicks.length - 1) this.replayIndex = 0;
    this.replayPlaying = true;
    this.playBtn.textContent = '⏸ PAUSE';
    this.lastFrameTime = performance.now();
    this.scheduleFrame();
  }

  private stopReplay() {
    this.replayPlaying = false;
    this.playBtn.textContent = '▶ PLAY';
    if (this.replayAF !== null) {
      cancelAnimationFrame(this.replayAF);
      this.replayAF = null;
    }
  }

  private scheduleFrame() {
    this.replayAF = requestAnimationFrame((now) => {
      if (!this.replayPlaying) return;
      const speedMultiplier = [0.5, 1, 2, 3, 4, 5, 6, 8][this.replaySpeed - 1] ?? 1;
      const elapsed = now - this.lastFrameTime;
      // At 200 ticks / 8 seconds = 25 ticks/s base rate
      const ticksPerSec = 25 * speedMultiplier;
      const ticksToAdvance = Math.max(1, Math.round(elapsed / 1000 * ticksPerSec));
      this.lastFrameTime = now;

      this.replayIndex = Math.min(this.replayIndex + ticksToAdvance, this.replayTicks.length - 1);
      this.renderFrame(this.replayIndex);

      if (this.replayIndex >= this.replayTicks.length - 1) {
        this.stopReplay();
      } else {
        this.scheduleFrame();
      }
    });
  }

  // ====== Utilities ======

  private setStatus(msg: string, color = 'var(--text-dim)') {
    this.statusEl.innerHTML = `<span style="color:${color};">${msg}</span>`;
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

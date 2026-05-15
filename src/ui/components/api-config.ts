import type { ApiProvider, Player } from '../../types';
import { PLAYER_COLORS, MAX_PLAYERS } from '../../constants';

export interface ApiConfigCallbacks {
  onStatusMessage: (html: string, type: 'info' | 'error' | 'success') => void;
  onAddPlayer: (player: Player) => void;
  onRemovePlayer: (playerId: number) => void;
}

const STORAGE_KEY = 'gravwell-players';

export class ApiConfig {
  private el: HTMLElement;
  private players: Player[] = [];
  private rosterEl!: HTMLElement;
  private callbacks: ApiConfigCallbacks;

  constructor(parent: HTMLElement, callbacks: ApiConfigCallbacks) {
    this.callbacks = callbacks;
    this.el = document.createElement('div');
    this.el.className = 'panel-section';
    this.el.innerHTML = `
      <div class="panel-section-title">API Configuration</div>
      <div class="field-row">
        <label class="field-label">PROVIDER</label>
        <select class="field-input" id="api-provider">
          <option value="openrouter">OpenRouter</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
        </select>
      </div>
      <div class="field-row">
        <label class="field-label">API KEY</label>
        <input type="password" class="field-input" id="api-key" placeholder="sk-or-... or sk-ant-...">
      </div>
      <div class="field-row">
        <label class="field-label">MODEL</label>
        <input type="text" class="field-input" id="model-input" placeholder="e.g. deepseek-chat">
      </div>
      <div class="btn-row">
        <button class="btn btn-sm" id="btn-add-player">ADD PLAYER</button>
        <button class="btn btn-sm btn-outline" id="btn-clear-key">CLEAR</button>
      </div>
      <div class="player-roster" id="player-roster"></div>
    `;
    parent.appendChild(this.el);

    this.rosterEl = this.el.querySelector('#player-roster') as HTMLElement;

    this.el.querySelector('#btn-add-player')!.addEventListener('click', () => this.handleAddPlayer());
    this.el.querySelector('#btn-clear-key')!.addEventListener('click', () => this.handleClear());

    this.loadSavedPlayers();
  }

  getPlayers(): Player[] {
    return [...this.players];
  }

  private handleAddPlayer(): void {
    const provider = this.getProvider();
    const apiKey = this.getApiKey();
    const model = this.getModel();

    if (!apiKey) {
      this.callbacks.onStatusMessage('Please enter an API key.', 'error');
      return;
    }
    if (!model) {
      this.callbacks.onStatusMessage('Please enter a model name.', 'error');
      return;
    }
    if (this.players.length >= MAX_PLAYERS) {
      this.callbacks.onStatusMessage(`Max ${MAX_PLAYERS} players allowed.`, 'error');
      return;
    }

    // Dedup: same provider + model = same player
    const existing = this.players.find(p => p.provider === provider && p.model === model);
    if (existing) {
      // Silently skip — update apiKey in case it changed
      if (existing.apiKey !== apiKey) {
        existing.apiKey = apiKey;
        this.savePlayers();
      }
      return;
    }

    // Find next available ID
    const usedIds = new Set(this.players.map(p => p.id));
    let id = 0;
    while (usedIds.has(id) && id < MAX_PLAYERS) id++;

    const player: Player = {
      id,
      provider,
      apiKey,
      model,
      color: PLAYER_COLORS[id],
      label: model,
    };

    this.players.push(player);
    this.savePlayers();
    this.renderRoster();
    this.callbacks.onAddPlayer(player);
    this.callbacks.onStatusMessage(
      `Player ${id + 1} added: ${model} <span style="color:${player.color}">●</span>`,
      'success'
    );
  }

  private handleClear(): void {
    (this.el.querySelector('#api-key') as HTMLInputElement).value = '';
    (this.el.querySelector('#model-input') as HTMLInputElement).value = '';
    (this.el.querySelector('#api-provider') as HTMLSelectElement).value = 'openrouter';
    this.callbacks.onStatusMessage('Form cleared.', 'info');
  }

  removePlayer(playerId: number): void {
    this.players = this.players.filter(p => p.id !== playerId);
    this.savePlayers();
    this.renderRoster();
    this.callbacks.onRemovePlayer(playerId);
  }

  private renderRoster(): void {
    if (this.players.length === 0) {
      this.rosterEl.innerHTML = '<div class="roster-empty">No players added</div>';
      return;
    }

    this.rosterEl.innerHTML = this.players.map(p => `
      <div class="player-roster-row" data-player-id="${p.id}">
        <div class="player-dot" style="background:${p.color}"></div>
        <span class="player-label">P${p.id + 1}</span>
        <span class="player-model">${p.label}</span>
        <span class="player-provider">${p.provider || 'baseline'}</span>
        <button class="btn-remove" data-remove-id="${p.id}" title="Remove player">&times;</button>
      </div>
    `).join('');

    // Wire remove buttons
    this.rosterEl.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt((btn as HTMLElement).dataset.removeId!);
        this.removePlayer(id);
      });
    });
  }

  addBaselinePlayer(): Player | null {
    if (this.players.length >= MAX_PLAYERS) {
      this.callbacks.onStatusMessage(`Max ${MAX_PLAYERS} players allowed.`, 'error');
      return null;
    }

    // Dedup: baseline already exists
    const existing = this.players.find(p => p.provider === null);
    if (existing) return existing;

    const usedIds = new Set(this.players.map(p => p.id));
    let id = 0;
    while (usedIds.has(id) && id < MAX_PLAYERS) id++;

    const player: Player = {
      id,
      provider: null,
      apiKey: '',
      model: 'baseline',
      color: PLAYER_COLORS[id],
      label: 'Baseline',
    };

    this.players.push(player);
    this.savePlayers();
    this.renderRoster();
    this.callbacks.onAddPlayer(player);
    this.callbacks.onStatusMessage(
      `Baseline player added <span style="color:${player.color}">●</span>`,
      'success'
    );
    return player;
  }

  private savePlayers(): void {
    // Save to localStorage (exclude apiKey for security — user re-enters on reload)
    // Actually, per user request: "他的数据是一直保存在里面的"
    const data = this.players.map(p => ({
      id: p.id,
      provider: p.provider,
      apiKey: p.apiKey,
      model: p.model,
      label: p.label,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private loadSavedPlayers(): void {
    // Migration: old single-player format
    const oldKey = localStorage.getItem('gravwell-api-key');
    const savedPlayers = localStorage.getItem(STORAGE_KEY);

    if (savedPlayers) {
      try {
        const data = JSON.parse(savedPlayers) as Array<{
          id: number;
          provider: ApiProvider | null;
          apiKey: string;
          model: string;
          label: string;
        }>;
        this.players = data.map(d => ({
          ...d,
          color: PLAYER_COLORS[d.id] || PLAYER_COLORS[0],
        }));
        this.renderRoster();
        // Notify for each player
        for (const p of this.players) {
          this.callbacks.onAddPlayer(p);
        }
      } catch {
        // Corrupted data, ignore
      }
    } else if (oldKey) {
      // Migrate old single-player config
      const provider = (localStorage.getItem('gravwell-api-provider') || 'openrouter') as ApiProvider;
      const model = localStorage.getItem('gravwell-api-model') || '';
      if (model) {
        const player: Player = {
          id: 0,
          provider,
          apiKey: oldKey,
          model,
          color: PLAYER_COLORS[0],
          label: model,
        };
        this.players.push(player);
        this.savePlayers();
        this.renderRoster();
        this.callbacks.onAddPlayer(player);
      }
      // Clean up old keys
      localStorage.removeItem('gravwell-api-key');
      localStorage.removeItem('gravwell-api-provider');
      localStorage.removeItem('gravwell-api-model');
    }
  }

  private getApiKey(): string {
    return (this.el.querySelector('#api-key') as HTMLInputElement).value;
  }

  private getProvider(): ApiProvider {
    return (this.el.querySelector('#api-provider') as HTMLSelectElement).value as ApiProvider;
  }

  private getModel(): string {
    return (this.el.querySelector('#model-input') as HTMLInputElement).value;
  }
}

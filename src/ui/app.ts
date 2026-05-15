import type { DecideFunction, GameConfig, SimulationResult, TickRecord } from '../types';
import type { DiagnosticReport } from '../llm/diagnostic';
import type { IterationRecord } from '../llm/iteration-engine';
import { DEFAULT_CONFIG } from '../constants';

// ====== LLM Materials Record ======
export interface LlmMaterialsRecord {
  round: number;
  type: 'generate' | 'iterate';
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
  extractedCode: string;
  diagnostic: DiagnosticReport | null;
  tokensUsed: { input: number; output: number };
}

// ====== App State ======
export interface AppState {
  config: GameConfig;
  currentBotCode: string;
  currentDecide: DecideFunction | null;
  simulationResult: SimulationResult | null;
  diagnostic: DiagnosticReport | null;

  // Replay
  replayTicks: TickRecord[];
  replayIndex: number;
  replayPlaying: boolean;
  replaySpeed: number;

  // Iteration
  iterationRecords: IterationRecord[];
  iterationRunning: boolean;

  // LLM Materials
  llmMaterials: LlmMaterialsRecord[];
}

export function createAppState(): AppState {
  return {
    config: { ...DEFAULT_CONFIG },
    currentBotCode: '',
    currentDecide: null,
    simulationResult: null,
    diagnostic: null,
    replayTicks: [],
    replayIndex: 0,
    replayPlaying: false,
    replaySpeed: 1,
    iterationRecords: [],
    iterationRunning: false,
    llmMaterials: [],
  };
}

// ====== Tab Interface ======
export interface Tab {
  el: HTMLElement;
  onActivate?(): void;
  onDeactivate?(): void;
}

// ====== App Class ======
export class App {
  private state: AppState;
  private tabs: Map<string, Tab> = new Map();
  private activeTabId = '';
  private tabBar!: HTMLElement;
  private tabContainer!: HTMLElement;

  constructor(root: HTMLElement) {
    this.state = createAppState();

    // Create tab bar
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'tab-bar';
    root.appendChild(this.tabBar);

    // Create tab content container
    this.tabContainer = document.createElement('div');
    this.tabContainer.style.cssText = 'flex:1;overflow:hidden;display:flex;';
    root.appendChild(this.tabContainer);
  }

  getState(): AppState {
    return this.state;
  }

  registerTab(id: string, label: string, tab: Tab): void {
    // Add tab button
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = id;
    btn.textContent = label;
    btn.addEventListener('click', () => this.switchTab(id));
    this.tabBar.appendChild(btn);

    // Add tab content
    tab.el.classList.add('tab-content');
    tab.el.id = `tab-${id}`;
    this.tabContainer.appendChild(tab.el);

    this.tabs.set(id, tab);

    // Activate first tab
    if (this.tabs.size === 1) {
      this.switchTab(id);
    }
  }

  registerPlaceholder(id: string, label: string, message: string): void {
    const el = document.createElement('div');
    el.innerHTML = `<div style="padding: 20px; color: var(--text-dim);">${message}</div>`;
    this.registerTab(id, label, { el });
  }

  switchTab(id: string): void {
    if (this.activeTabId === id) return;

    // Deactivate current
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.el.classList.remove('active');
        current.onDeactivate?.();
      }
      this.tabBar.querySelector(`[data-tab="${this.activeTabId}"]`)?.classList.remove('active');
    }

    // Activate new
    const next = this.tabs.get(id);
    if (next) {
      next.el.classList.add('active');
      next.onActivate?.();
    }
    this.tabBar.querySelector(`[data-tab="${id}"]`)?.classList.add('active');

    this.activeTabId = id;
  }
}

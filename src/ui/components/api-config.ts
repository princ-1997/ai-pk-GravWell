import type { ApiProvider } from '../../llm/api';

export interface ApiConfigCallbacks {
  onStatusMessage: (html: string, type: 'info' | 'error' | 'success') => void;
}

export class ApiConfig {
  private el: HTMLElement;

  constructor(parent: HTMLElement, callbacks: ApiConfigCallbacks) {
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
        <button class="btn btn-sm" id="btn-save-key">SAVE</button>
        <button class="btn btn-sm btn-outline" id="btn-clear-key">CLEAR</button>
      </div>
    `;
    parent.appendChild(this.el);

    this.el.querySelector('#btn-save-key')!.addEventListener('click', () => {
      localStorage.setItem('gravwell-api-key', this.getApiKey());
      localStorage.setItem('gravwell-api-provider', this.getProvider());
      localStorage.setItem('gravwell-api-model', this.getModel());
      callbacks.onStatusMessage('API key saved.', 'success');
    });

    this.el.querySelector('#btn-clear-key')!.addEventListener('click', () => {
      localStorage.removeItem('gravwell-api-key');
      localStorage.removeItem('gravwell-api-provider');
      localStorage.removeItem('gravwell-api-model');
      (this.el.querySelector('#api-key') as HTMLInputElement).value = '';
      (this.el.querySelector('#model-input') as HTMLInputElement).value = '';
      callbacks.onStatusMessage('API key cleared.', 'info');
    });

    this.loadSaved();
  }

  getApiKey(): string {
    return (this.el.querySelector('#api-key') as HTMLInputElement).value;
  }

  getProvider(): ApiProvider {
    return (this.el.querySelector('#api-provider') as HTMLSelectElement).value as ApiProvider;
  }

  getModel(): string {
    return (this.el.querySelector('#model-input') as HTMLInputElement).value;
  }

  private loadSaved(): void {
    const key = localStorage.getItem('gravwell-api-key') || '';
    const provider = localStorage.getItem('gravwell-api-provider') || 'openrouter';
    const model = localStorage.getItem('gravwell-api-model') || '';
    (this.el.querySelector('#api-key') as HTMLInputElement).value = key;
    (this.el.querySelector('#api-provider') as HTMLSelectElement).value = provider;
    (this.el.querySelector('#model-input') as HTMLInputElement).value = model;
  }
}

export interface IterationPanelCallbacks {
  onIterate: () => void;
  onStop: () => void;
}

export class IterationPanel {
  private el: HTMLElement;
  private progressEl: HTMLElement;
  private stopBtn: HTMLButtonElement;
  private iterateBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, callbacks: IterationPanelCallbacks) {
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <div class="btn-row" style="margin-bottom: 6px;">
        <button class="btn btn-sm" id="btn-iterate">ITERATE</button>
        <select class="field-input" id="iterate-rounds" style="width: auto; padding: 4px 6px;">
          <option value="3">3 rounds</option>
          <option value="5" selected>5 rounds</option>
          <option value="10">10 rounds</option>
        </select>
        <button class="btn btn-sm btn-outline" id="btn-stop-iterate" style="display:none;">STOP</button>
      </div>
      <div id="iteration-progress" style="display:none; font-size: 11px; color: var(--text-dim); margin-bottom: 6px;"></div>
    `;
    parent.appendChild(this.el);

    this.iterateBtn = this.el.querySelector('#btn-iterate') as HTMLButtonElement;
    this.stopBtn = this.el.querySelector('#btn-stop-iterate') as HTMLButtonElement;
    this.progressEl = this.el.querySelector('#iteration-progress') as HTMLElement;

    this.iterateBtn.addEventListener('click', callbacks.onIterate);
    this.stopBtn.addEventListener('click', callbacks.onStop);
  }

  getRounds(): number {
    return parseInt((this.el.querySelector('#iterate-rounds') as HTMLSelectElement).value);
  }

  setRunning(running: boolean): void {
    this.stopBtn.style.display = running ? 'inline-block' : 'none';
  }

  showProgress(text: string): void {
    this.progressEl.style.display = 'block';
    this.progressEl.textContent = text;
  }

  setIterateDisabled(disabled: boolean): void {
    this.iterateBtn.disabled = disabled;
  }
}

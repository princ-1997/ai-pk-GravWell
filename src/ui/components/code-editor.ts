export interface CodeEditorCallbacks {
  onGenerate: () => void;
  onLoadBaseline: () => void;
  onApplyEdit: () => void;
}

export class CodeEditor {
  private el: HTMLElement;
  private textarea: HTMLTextAreaElement;

  constructor(parent: HTMLElement, callbacks: CodeEditorCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'panel-section bot-code-container';
    this.el.innerHTML = `
      <div class="panel-section-title">BOT CODE</div>
      <div class="btn-row" style="margin-top: 0; margin-bottom: 6px;">
        <button class="btn btn-sm" id="btn-generate">GENERATE BOT</button>
        <button class="btn btn-sm btn-outline" id="btn-load-baseline">LOAD BASELINE</button>
        <button class="btn btn-sm btn-outline" id="btn-load-code">APPLY EDIT</button>
      </div>
      <textarea class="bot-code" id="bot-code" spellcheck="false" placeholder="// Bot code will appear here after generation..."></textarea>
    `;
    parent.appendChild(this.el);

    this.textarea = this.el.querySelector('#bot-code') as HTMLTextAreaElement;

    this.el.querySelector('#btn-generate')!.addEventListener('click', callbacks.onGenerate);
    this.el.querySelector('#btn-load-baseline')!.addEventListener('click', callbacks.onLoadBaseline);
    this.el.querySelector('#btn-load-code')!.addEventListener('click', callbacks.onApplyEdit);
  }

  getCode(): string {
    return this.textarea.value;
  }

  setCode(code: string): void {
    this.textarea.value = code;
  }

  setGenerateDisabled(disabled: boolean): void {
    (this.el.querySelector('#btn-generate') as HTMLButtonElement).disabled = disabled;
  }
}

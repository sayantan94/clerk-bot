/**
 * Clerk-Bot Overlay UI — floating Shadow DOM panel with status display,
 * human-in-the-loop question input, and auto-fill/stop controls.
 */

type OverlayStatus = 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'stopped';

export class ClerkBotOverlay {
  private root: HTMLElement;
  private shadow: ShadowRoot;
  private container: HTMLElement;
  private minimized: boolean = false;

  private statusIcon!: HTMLElement;
  private statusText!: HTMLElement;
  private bodySection!: HTMLElement;
  private autoFillBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private minimizeBtn!: HTMLButtonElement;
  private questionSection!: HTMLElement;

  onAutoFill: (() => void) | null = null;
  onStop: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'clerk-bot-overlay';
    this.shadow = this.root.attachShadow({ mode: 'closed' });
    this.container = document.createElement('div');
    this.container.setAttribute('id', 'clerk-overlay-container');

    this.injectStyles();
    this.buildUI();
    this.shadow.appendChild(this.container);
    this.makeDraggable();
  }

  mount(): void {
    document.body.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }

  setStatus(status: OverlayStatus, message?: string): void {
    this.statusIcon.textContent = statusIconFor(status);
    this.statusText.textContent = message ?? defaultMessageFor(status);

    const isActive = status === 'running' || status === 'waiting';
    this.autoFillBtn.disabled = isActive;
    this.autoFillBtn.style.display = isActive ? 'none' : 'block';
    this.stopBtn.style.display = isActive ? 'block' : 'none';
  }

  showQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.questionSection.innerHTML = '';

      const heading = el('div', { class: 'question-heading' });
      heading.textContent = question;
      this.questionSection.appendChild(heading);

      const input = el('input', {
        class: 'question-input',
        type: 'text',
        placeholder: 'Type your answer...',
      }) as HTMLInputElement;
      this.questionSection.appendChild(input);

      const submitBtn = el('button', { class: 'submit-btn' }) as HTMLButtonElement;
      submitBtn.textContent = 'Submit';

      const submit = () => {
        const answer = input.value.trim();
        if (answer) {
          this.questionSection.innerHTML = '';
          resolve(answer);
        }
      };

      submitBtn.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      this.questionSection.appendChild(submitBtn);

      setTimeout(() => input.focus(), 50);
    });
  }

  private buildUI(): void {
    const header = el('div', { class: 'header' });

    const titleArea = el('div', { class: 'title-area' });
    const logo = el('span', { class: 'logo' });
    logo.textContent = 'C';
    const title = el('span', { class: 'title' });
    title.textContent = 'Clerk-Bot';
    titleArea.appendChild(logo);
    titleArea.appendChild(title);

    this.minimizeBtn = el('button', { class: 'minimize-btn' }) as HTMLButtonElement;
    this.minimizeBtn.textContent = '\u2013';
    this.minimizeBtn.title = 'Minimize';
    this.minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    });

    header.appendChild(titleArea);
    header.appendChild(this.minimizeBtn);

    this.bodySection = el('div', { class: 'body' });

    const statusLine = el('div', { class: 'status-line' });
    this.statusIcon = el('span', { class: 'status-icon' });
    this.statusIcon.textContent = statusIconFor('idle');
    this.statusText = el('span', { class: 'status-text' });
    this.statusText.textContent = defaultMessageFor('idle');
    statusLine.appendChild(this.statusIcon);
    statusLine.appendChild(this.statusText);

    this.autoFillBtn = el('button', { class: 'autofill-btn' }) as HTMLButtonElement;
    this.autoFillBtn.textContent = 'Auto-fill';
    this.autoFillBtn.addEventListener('click', () => this.onAutoFill?.());

    this.stopBtn = el('button', { class: 'stop-btn' }) as HTMLButtonElement;
    this.stopBtn.textContent = 'Stop';
    this.stopBtn.style.display = 'none';
    this.stopBtn.addEventListener('click', () => this.onStop?.());

    this.questionSection = el('div', { class: 'question-section' });

    this.bodySection.appendChild(statusLine);
    this.bodySection.appendChild(this.autoFillBtn);
    this.bodySection.appendChild(this.stopBtn);
    this.bodySection.appendChild(this.questionSection);

    this.container.appendChild(header);
    this.container.appendChild(this.bodySection);
  }

  private makeDraggable(): void {
    const header = this.container.querySelector('.header') as HTMLElement;
    if (!header) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('minimize-btn')) return;
      isDragging = true;
      const rect = this.container.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      this.container.style.left = `${e.clientX - offsetX}px`;
      this.container.style.top = `${e.clientY - offsetY}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
      }
    });
  }

  private toggleMinimize(): void {
    this.minimized = !this.minimized;
    this.bodySection.style.display = this.minimized ? 'none' : 'block';
    this.minimizeBtn.textContent = this.minimized ? '+' : '\u2013';
    this.minimizeBtn.title = this.minimized ? 'Expand' : 'Minimize';
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = /* css */ `
      #clerk-overlay-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        color: #1f2937;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
        line-height: 1.4;
      }
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px; background: #4f46e5; color: #fff;
        cursor: grab; user-select: none;
        border-radius: 10px 10px 0 0;
      }
      .title-area { display: flex; align-items: center; gap: 6px; }
      .logo {
        display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; border-radius: 4px;
        background: rgba(255,255,255,0.2); font-weight: 700; font-size: 12px;
      }
      .title { font-weight: 600; font-size: 13px; }
      .minimize-btn {
        background: none; border: none; color: #fff; font-size: 16px;
        cursor: pointer; width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 4px; padding: 0;
      }
      .minimize-btn:hover { background: rgba(255,255,255,0.2); }
      .body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
      .status-line { display: flex; align-items: flex-start; gap: 6px; }
      .status-icon { flex-shrink: 0; font-size: 14px; }
      .status-text { font-size: 12px; color: #4b5563; word-break: break-word; }
      .autofill-btn {
        width: 100%; padding: 7px 0; background: #4f46e5; color: #fff;
        border: none; border-radius: 6px; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: background 0.15s;
      }
      .autofill-btn:hover:not(:disabled) { background: #4338ca; }
      .autofill-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .stop-btn {
        width: 100%; padding: 7px 0; background: #dc2626; color: #fff;
        border: none; border-radius: 6px; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: background 0.15s;
      }
      .stop-btn:hover { background: #b91c1c; }
      .question-section { display: flex; flex-direction: column; gap: 6px; }
      .question-heading {
        font-size: 12px; font-weight: 600; color: #92400e;
        background: #fef3c7; padding: 6px 8px; border-radius: 4px;
        margin-top: 4px;
      }
      .question-input {
        width: 100%; padding: 5px 8px; font-size: 12px;
        border: 1px solid #d1d5db; border-radius: 4px;
        outline: none; box-sizing: border-box;
      }
      .question-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79,70,229,0.15); }
      .submit-btn {
        width: 100%; padding: 7px 0; background: #059669; color: #fff;
        border: none; border-radius: 6px; font-size: 13px; font-weight: 600;
        cursor: pointer; transition: background 0.15s; margin-top: 4px;
      }
      .submit-btn:hover { background: #047857; }
    `;
    this.shadow.appendChild(style);
  }
}

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function statusIconFor(status: OverlayStatus): string {
  const map: Record<OverlayStatus, string> = {
    idle: '\u25CB', running: '\u25CE', waiting: '\u25D4',
    done: '\u25CF', error: '\u25C6', stopped: '\u25A0',
  };
  return map[status];
}

function defaultMessageFor(status: OverlayStatus): string {
  const map: Record<OverlayStatus, string> = {
    idle: 'Ready.', running: 'Working...', waiting: 'Waiting for your answer...',
    done: 'Done!', error: 'Error.', stopped: 'Stopped.',
  };
  return map[status];
}

import { type App,Modal, Notice, requestUrl, Setting } from 'obsidian';

interface McpImportModalResult {
  text: string;
}

function toRawGitHubUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'gist.githubusercontent.com') {
      return url.toString();
    }

    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const blobIndex = parts.indexOf('blob');
      if (blobIndex === 2 && parts.length > blobIndex + 1) {
        const [owner, repo, , branch, ...rest] = parts;
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join('/')}`;
      }
    }
  } catch {
    // Not a URL; treat the original input as raw JSON or a local-looking value.
  }

  return value;
}

export class McpImportModal extends Modal {
  private resolvePromise: ((result: McpImportModalResult | null) => void) | null = null;
  private urlValue = '';
  private jsonValue = '';

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    this.setTitle('Import MCP configuration');
    this.modalEl.addClass('ocop-mcp-modal');

    new Setting(this.contentEl)
      .setName('GitHub or raw JSON URL')
      .setDesc('Paste a GitHub file URL, raw.githubusercontent.com URL, or gist raw URL.')
      .addText((text) => {
        text.setPlaceholder('https://github.com/.../blob/.../mcp.json');
        text.setValue(this.urlValue);
        text.onChange((value) => {
          this.urlValue = value.trim();
        });
      });

    new Setting(this.contentEl)
      .setName('Or paste MCP JSON directly')
      .setDesc('Supports full mcpServers JSON, VS Code-style server JSON, or a single server config.')
      .addTextArea((text) => {
        text.setPlaceholder('{\n  "mcpServers": { ... }\n}');
        text.setValue(this.jsonValue);
        text.onChange((value) => {
          this.jsonValue = value;
        });
        text.inputEl.rows = 10;
        text.inputEl.cols = 50;
      });

    const buttonRow = this.contentEl.createDiv({ cls: 'ocop-mcp-buttons' });
    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel', cls: 'ocop-cancel-btn' });
    cancelBtn.addEventListener('click', () => this.finish(null));

    const importBtn = buttonRow.createEl('button', { text: 'Import', cls: 'ocop-save-btn mod-cta' });
    importBtn.addEventListener('click', async () => {
      const result = await this.buildResult();
      if (!result) {
        return;
      }
      this.finish(result);
    });
  }

  onClose() {
    this.contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  openAndWait(): Promise<McpImportModalResult | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private async buildResult(): Promise<McpImportModalResult | null> {
    if (this.urlValue) {
      try {
        const response = await requestUrl({ url: toRawGitHubUrl(this.urlValue) });
        return { text: response.text };
      } catch (error) {
        new Notice(error instanceof Error ? error.message : 'Failed to fetch MCP config');
        return null;
      }
    }

    if (this.jsonValue.trim()) {
      return { text: this.jsonValue };
    }

    new Notice('Paste a GitHub URL or MCP JSON to import');
    return null;
  }

  private finish(result: McpImportModalResult | null) {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    this.close();
    resolve?.(result);
  }
}

export { toRawGitHubUrl };

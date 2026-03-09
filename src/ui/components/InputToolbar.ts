import type { UsageInfo } from '../../core/types';
import { type ClaudeModel, COPILOT_MODELS } from '../../core/types/models';

export interface ToolbarSettings {
  model: ClaudeModel;
}

export interface ToolbarCallbacks {
  onModelChange: (model: ClaudeModel) => Promise<void>;
  getSettings: () => ToolbarSettings;
}

export class ModelSelector {
  private container: HTMLElement;
  private buttonEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'oc-model-selector' });
    this.render();
  }

  private render() {
    this.container.empty();
    this.buttonEl = this.container.createDiv({ cls: 'oc-model-btn' });
    this.dropdownEl = this.container.createDiv({ cls: 'oc-model-dropdown' });
    this.updateDisplay();
    this.renderOptions();
  }

  updateDisplay() {
    if (!this.buttonEl) return;
    const selected = COPILOT_MODELS.find((model: { value: string }) => model.value === this.callbacks.getSettings().model) ?? COPILOT_MODELS[0];

    this.buttonEl.empty();
    this.buttonEl.createSpan({ cls: 'oc-model-label', text: selected.label });
    this.buttonEl.createSpan({ cls: 'oc-model-cost', text: selected.costLabel });
  }

  renderOptions() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const current = this.callbacks.getSettings().model;
    for (const model of COPILOT_MODELS) {
      const optionEl = this.dropdownEl.createDiv({ cls: 'oc-model-option' });
      if (model.value === current) {
        optionEl.addClass('selected');
      }

      const textEl = optionEl.createDiv({ cls: 'oc-model-option-text' });
      textEl.createSpan({ cls: 'oc-model-option-label', text: model.label });
      textEl.createSpan({ cls: 'oc-model-desc', text: model.description });
      optionEl.createSpan({ cls: 'oc-model-option-cost', text: model.costLabel });
      optionEl.setAttribute('title', model.description);

      optionEl.addEventListener('click', async (event) => {
        event.stopPropagation();
        await this.callbacks.onModelChange(model.value);
        this.updateDisplay();
        this.renderOptions();
      });
    }
  }
}

export class ThinkingBudgetSelector {
  updateDisplay(): void {}
}

export class PermissionToggle {
  setOnPlanModeToggle(_callback: (active: boolean) => void): void {}
  setPlanModeActive(_active: boolean): void {}
  isPlanModeActive(): boolean { return false; }
  async togglePlanMode(): Promise<void> {}
}

export class ExternalContextSelector {
  setOnChange(_callback: (paths: string[]) => void): void {}
  getExternalContexts(): string[] { return []; }
  setExternalContexts(_paths: string[]): void {}
  clearExternalContexts(): void {}
}

export class McpServerSelector {
  setMcpService(_service: unknown): void {}
  addMentionedServers(_names: Set<string>): void {}
  clearEnabled(): void {}
  setEnabledServers(_names: string[]): void {}
  getEnabledServers(): Set<string> { return new Set(); }
}

export class ContextUsageMeter {
  private container: HTMLElement;
  private valueEl: HTMLElement;

  constructor(parentEl: HTMLElement) {
    this.container = parentEl.createDiv({ cls: 'oc-context-meter' });
    this.valueEl = this.container.createSpan({ cls: 'oc-context-meter-percent' });
    this.container.style.display = 'none';
  }

  update(usage: UsageInfo | null): void {
    if (!usage) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';
    this.valueEl.setText(`${usage.percentage}% used`);
    this.container.toggleClass('warning', usage.percentage > 80);
    this.container.setAttribute('data-tooltip', `${usage.contextTokens} / ${usage.contextWindow}`);
  }
}

export function createInputToolbar(
  parentEl: HTMLElement,
  callbacks: ToolbarCallbacks
): {
  modelSelector: ModelSelector;
  thinkingBudgetSelector: ThinkingBudgetSelector;
  contextUsageMeter: ContextUsageMeter;
  externalContextSelector: ExternalContextSelector;
  mcpServerSelector: McpServerSelector;
  permissionToggle: PermissionToggle;
} {
  const modelSelector = new ModelSelector(parentEl, callbacks);
  const thinkingBudgetSelector = new ThinkingBudgetSelector();
  const contextUsageMeter = new ContextUsageMeter(parentEl);
  const externalContextSelector = new ExternalContextSelector();
  const mcpServerSelector = new McpServerSelector();
  const permissionToggle = new PermissionToggle();

  return {
    modelSelector,
    thinkingBudgetSelector,
    contextUsageMeter,
    externalContextSelector,
    mcpServerSelector,
    permissionToggle,
  };
}

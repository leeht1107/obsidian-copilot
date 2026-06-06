import { Notice, setIcon } from 'obsidian';
import * as os from 'os';

import type {
  CopilotMcpServer,
  CopilotModel,
  PermissionMode,
  ThinkingBudget,
  UsageInfo,
} from '../../core/types';
import {
  COPILOT_MODELS,
  THINKING_BUDGETS,
} from '../../core/types';
import { CHECK_ICON_SVG, MCP_ICON_SVG } from '../../features/chat/constants';
import type { McpService } from '../../features/mcp/McpService';
import { findConflictingPath } from '../../utils/externalContext';

export interface ToolbarSettings {
  model: CopilotModel;
  thinkingBudget: ThinkingBudget;
  permissionMode: PermissionMode;
  lastNonPlanPermissionMode?: 'agent' | 'ask';
}

export interface ToolbarCallbacks {
  onModelChange: (model: CopilotModel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
  onOpenQuiz?: () => Promise<void>;
  onOpenSocratic?: () => Promise<void>;
  getSettings: () => ToolbarSettings;
  getEnvironmentVariables?: () => string;
  isAgentInitiatedPlanMode?: () => boolean;
  isPlanModeRequested?: () => boolean;
}

type CostBucket = 'best' | '0x' | '0.33x' | '1x' | '3x';

type ElectronRequire = (moduleName: 'electron') => {
  remote?: {
    dialog: {
      showOpenDialog(options: { properties: string[]; title: string }): Promise<{
        canceled: boolean;
        filePaths: string[];
      }>;
    };
  };
};

function getProviderGroup(model: CopilotModel): string {
  if (model === 'auto') return 'recommended';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('raptor-')) return 'github';
  return 'other';
}

function getCostOrder(costLabel: string): number {
  const order: Record<CostBucket, number> = {
    best: 0,
    '0x': 1,
    '0.33x': 2,
    '1x': 3,
    '3x': 4,
  };
  return order[(costLabel as CostBucket)] ?? 99;
}

function getProviderOrder(provider: string): number {
  const order: Record<string, number> = {
    recommended: 0,
    openai: 1,
    anthropic: 2,
    google: 3,
    github: 4,
    other: 5,
  };
  return order[provider] ?? 99;
}

function getProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    recommended: 'recommended',
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
    github: 'github',
    other: 'other',
  };
  return labels[provider] ?? provider;
}

export class ModelSelector {
  private container: HTMLElement;
  private buttonEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'ocop-model-selector' });
    this.render();
  }

  private getAvailableModels() {
    return [...COPILOT_MODELS];
  }

  private render() {
    this.container.empty();
    this.buttonEl = this.container.createDiv({ cls: 'ocop-model-btn' });
    this.updateDisplay();
    this.dropdownEl = this.container.createDiv({ cls: 'ocop-model-dropdown' });
    this.renderOptions();
  }

  updateDisplay() {
    if (!this.buttonEl) return;
    const currentModel = this.callbacks.getSettings().model;
    const models = this.getAvailableModels();
    const modelInfo = models.find((model) => model.value === currentModel) ?? models[0];

    this.buttonEl.empty();
    this.buttonEl.createSpan({ cls: 'ocop-model-label', text: modelInfo?.label || 'Unknown' });
    if (modelInfo?.costLabel) {
      this.buttonEl.createSpan({ cls: 'ocop-model-cost', text: modelInfo.costLabel });
    }
  }

  renderOptions() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const currentModel = this.callbacks.getSettings().model;
    const models = [...this.getAvailableModels()].sort((a, b) => {
      const costDiff = getCostOrder(a.costLabel) - getCostOrder(b.costLabel);
      if (costDiff !== 0) return costDiff;
      const providerDiff = getProviderOrder(getProviderGroup(a.value)) - getProviderOrder(getProviderGroup(b.value));
      if (providerDiff !== 0) return providerDiff;
      return a.label.localeCompare(b.label);
    });

    let lastCostLabel: string | null = null;
    let lastProvider: string | null = null;

    for (const model of models) {
      const provider = getProviderGroup(model.value);
      if (model.costLabel !== lastCostLabel) {
        this.dropdownEl.createDiv({ cls: 'ocop-model-section-label', text: model.costLabel });
        lastCostLabel = model.costLabel;
        lastProvider = null;
      }
      if (provider !== lastProvider) {
        this.dropdownEl.createDiv({ cls: 'ocop-model-provider-label', text: getProviderLabel(provider) });
        lastProvider = provider;
      }

      const option = this.dropdownEl.createDiv({ cls: 'ocop-model-option' });
      if (model.value === currentModel) {
        option.addClass('selected');
      }

      const textEl = option.createDiv({ cls: 'ocop-model-option-text' });
      textEl.createSpan({ cls: 'ocop-model-option-label', text: model.label });
      if (model.description) {
        option.setAttribute('title', model.description);
        textEl.createSpan({ cls: 'ocop-model-desc', text: model.description });
      }
      option.createSpan({ cls: 'ocop-model-option-cost', text: model.costLabel });

      option.addEventListener('click', async (event) => {
        event.stopPropagation();
      await this.callbacks.onModelChange(model.value);
        this.updateDisplay();
        this.renderOptions();
      });
    }
  }
}

export class ThinkingBudgetSelector {
  private container: HTMLElement;
  private gearsEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'ocop-thinking-selector' });
    this.render();
  }

  private isEnabled(): boolean {
    const currentModel = this.callbacks.getSettings().model;
    return COPILOT_MODELS.find((m) => m.value === currentModel)?.supportsReasoning ?? false;
  }

  private render() {
    this.container.empty();
    this.container.createSpan({ cls: 'ocop-thinking-label-text', text: 'Thinking:' });
    this.gearsEl = this.container.createDiv({ cls: 'ocop-thinking-gears' });
    this.updateDisplay();
    this.container.addEventListener('click', () => {
      void this.cycleThinkingBudget();
    });
  }

  private async cycleThinkingBudget() {
    if (!this.isEnabled()) return;
    const levels: ThinkingBudget[] = ['off', 'low', 'medium', 'high'];
    const current = this.callbacks.getSettings().thinkingBudget;
    const currentIndex = levels.indexOf(current);
    const next = levels[(currentIndex + 1) % levels.length];
    await this.callbacks.onThinkingBudgetChange(next);
    this.updateDisplay();
  }

  updateDisplay() {
    if (!this.gearsEl) return;
    this.gearsEl.empty();

    if (this.isEnabled()) {
      this.container.removeClass('is-disabled');
    } else {
      this.container.addClass('is-disabled');
    }

    const currentBudget = this.callbacks.getSettings().thinkingBudget;
    const currentBudgetInfo = THINKING_BUDGETS.find((b) => b.value === currentBudget);
    const label = currentBudgetInfo?.label || 'off';
    const cls = currentBudget === 'off'
      ? 'ocop-thinking-current ocop-thinking-disabled'
      : 'ocop-thinking-current ocop-thinking-active';
    this.gearsEl.createDiv({ cls, text: label });
    this.gearsEl.setAttribute('title', this.isEnabled()
      ? 'Click to change thinking level'
      : 'Thinking not available for this model');
  }
}

export class PermissionToggle {
  private container: HTMLElement;
  private toggleEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private callbacks: ToolbarCallbacks;
  private onPlanModeToggle: ((active: boolean) => void) | null = null;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'ocop-permission-toggle' });
    this.render();
  }

  private render() {
    this.container.empty();
    this.labelEl = this.container.createSpan({ cls: 'ocop-permission-label' });
    this.toggleEl = this.container.createDiv({ cls: 'ocop-toggle-switch' });
    this.updateDisplay();
    this.container.addEventListener('click', () => {
      void this.toggle();
    });
  }

  setOnPlanModeToggle(callback: (active: boolean) => void) {
    this.onPlanModeToggle = callback;
  }

  setPlanModeActive(_active: boolean) {
    this.updateDisplay();
  }

  isPlanModeActive(): boolean {
    return this.isPlanModeLocked() || this.isPlanModeRequested();
  }

  private isPlanModeLocked(): boolean {
    return this.callbacks.getSettings().permissionMode === 'plan';
  }

  private isPlanModeRequested(): boolean {
    return this.callbacks.isPlanModeRequested?.() ?? false;
  }

  updateDisplay() {
    if (!this.toggleEl || !this.labelEl) return;

    this.container.removeClass('plan-mode');
    this.labelEl.empty();

    const mode = this.callbacks.getSettings().permissionMode;
    if (mode === 'plan') {
      this.container.addClass('plan-mode');
      this.toggleEl.removeClass('active');
      const iconEl = this.labelEl.createSpan({ cls: 'ocop-plan-mode-icon' });
      iconEl.textContent = '▎▎';
      iconEl.style.fontSize = '0.8em';
      iconEl.style.letterSpacing = '-4px';
      this.labelEl.createSpan({ text: 'Plan' });
    } else if (mode === 'agent') {
      this.toggleEl.addClass('active');
      this.labelEl.setText('Agent');
    } else {
      this.toggleEl.removeClass('active');
      this.labelEl.setText('Ask');
    }
  }

  private async toggle() {
    const current = this.callbacks.getSettings().permissionMode;
    let next: PermissionMode;

    if (current === 'agent') {
      next = 'plan';
    } else if (current === 'plan') {
      next = 'ask';
    } else {
      next = 'agent';
    }

    await this.callbacks.onPermissionModeChange(next);
    this.updateDisplay();
  }

  async togglePlanMode() {
    if (this.isPlanModeLocked()) {
      new Notice('Plan mode is active until the plan is approved.');
      return;
    }

    this.onPlanModeToggle?.(!this.isPlanModeRequested());
    this.updateDisplay();
  }
}

export class QuizLauncherButton {
  private container: HTMLElement;
  private callbacks: ToolbarCallbacks;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'ocop-quiz-launcher' });
    this.render();
  }

  private render() {
    this.container.empty();
    const button = this.container.createEl('button', {
      cls: 'ocop-quiz-launcher-btn',
      text: '📝 퀴즈',
      attr: { 'aria-label': 'Open guided quiz setup' },
    });
    button.type = 'button';
    button.addEventListener('click', async () => {
      await this.callbacks.onOpenQuiz?.();
    });
  }
}

export class SocraticLauncherButton {
  private container: HTMLElement;
  private callbacks: ToolbarCallbacks;
  private buttonEl: HTMLButtonElement | null = null;

  constructor(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.container = parentEl.createDiv({ cls: 'ocop-socratic-launcher' });
    this.render();
  }

  private render() {
    this.container.empty();
    const button = this.container.createEl('button', {
      cls: 'ocop-socratic-launcher-btn',
      text: '🧠 학습 모드',
      attr: { 'aria-label': '소크라테스 대화 시작', title: '질문 중심 학습 대화로 전환' },
    }) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await this.callbacks.onOpenSocratic?.();
      } finally {
        button.disabled = false;
      }
    });
    this.buttonEl = button;
  }

  setActive(active: boolean): void {
    if (!this.buttonEl) return;
    this.buttonEl.classList.toggle('is-active', active);
    this.buttonEl.textContent = active ? '🧠 학습 중' : '🧠 학습 모드';
  }
}

export class ExternalContextSelector {
  private container: HTMLElement;
  private iconEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private externalContextPaths: string[] = [];
  private onChangeCallback: ((paths: string[]) => void) | null = null;

  constructor(parentEl: HTMLElement) {
    this.container = parentEl.createDiv({ cls: 'ocop-external-context-selector' });
    this.render();
  }

  setOnChange(callback: (paths: string[]) => void): void {
    this.onChangeCallback = callback;
  }

  getExternalContexts(): string[] {
    return [...this.externalContextPaths];
  }

  setExternalContexts(paths: string[]): void {
    this.externalContextPaths = [...paths];
    this.updateDisplay();
    this.renderDropdown();
  }

  clearExternalContexts(): void {
    this.externalContextPaths = [];
    this.updateDisplay();
    this.renderDropdown();
  }

  private render() {
    this.container.empty();

    const iconWrapper = this.container.createDiv({ cls: 'ocop-external-context-icon-wrapper' });
    this.iconEl = iconWrapper.createDiv({ cls: 'ocop-external-context-icon' });
    setIcon(this.iconEl, 'folder');
    this.badgeEl = iconWrapper.createDiv({ cls: 'ocop-external-context-badge' });
    this.updateDisplay();

    iconWrapper.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.openFolderPicker();
    });

    this.dropdownEl = this.container.createDiv({ cls: 'ocop-external-context-dropdown' });
    this.renderDropdown();
  }

  private async openFolderPicker() {
    try {
      const electronRequire = (window as Window & { require?: ElectronRequire }).require;
      const remote = electronRequire?.('electron').remote;
      if (!remote) {
        throw new Error('Electron remote API is not available');
      }
      const result = await remote.dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select External Context',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        if (this.externalContextPaths.includes(selectedPath)) {
          return;
        }

        const conflict = findConflictingPath(selectedPath, this.externalContextPaths);
        if (conflict) {
          this.showConflictNotice(selectedPath, conflict);
          return;
        }

        this.externalContextPaths = [...this.externalContextPaths, selectedPath];
        this.onChangeCallback?.(this.externalContextPaths);
        this.updateDisplay();
        this.renderDropdown();
      }
    } catch (error) {
      console.error('Failed to open folder picker:', error);
    }
  }

  private showConflictNotice(newPath: string, conflict: { path: string; type: 'parent' | 'child' }) {
    const shortNew = this.shortenPath(newPath);
    const shortExisting = this.shortenPath(conflict.path);
    const message = conflict.type === 'parent'
      ? `Cannot add "${shortNew}" - it's inside existing path "${shortExisting}"`
      : `Cannot add "${shortNew}" - it contains existing path "${shortExisting}"`;
    new Notice(message, 5000);
  }

  private renderDropdown() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    this.dropdownEl.createDiv({ cls: 'ocop-external-context-header', text: 'External Contexts' });
    const listEl = this.dropdownEl.createDiv({ cls: 'ocop-external-context-list' });

    if (this.externalContextPaths.length === 0) {
      listEl.createDiv({ cls: 'ocop-external-context-empty', text: 'Click folder icon to add' });
      return;
    }

    for (const pathStr of this.externalContextPaths) {
      const itemEl = listEl.createDiv({ cls: 'ocop-external-context-item' });
      const pathTextEl = itemEl.createSpan({ cls: 'ocop-external-context-text' });
      pathTextEl.setText(this.shortenPath(pathStr));
      pathTextEl.setAttribute('title', pathStr);

      const removeBtn = itemEl.createSpan({ cls: 'ocop-external-context-remove' });
      setIcon(removeBtn, 'x');
      removeBtn.setAttribute('title', 'Remove path');
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.externalContextPaths = this.externalContextPaths.filter((entry) => entry !== pathStr);
        this.onChangeCallback?.(this.externalContextPaths);
        this.updateDisplay();
        this.renderDropdown();
      });
    }
  }

  private shortenPath(fullPath: string): string {
    try {
      const homeDir = os.homedir();
      const normalize = (value: string) => value.replace(/\\/g, '/');
      const normalizedFull = normalize(fullPath);
      const normalizedHome = normalize(homeDir);
      const compareFull = process.platform === 'win32' ? normalizedFull.toLowerCase() : normalizedFull;
      const compareHome = process.platform === 'win32' ? normalizedHome.toLowerCase() : normalizedHome;
      if (compareFull.startsWith(compareHome)) {
        return '~' + fullPath.slice(homeDir.length);
      }
    } catch {
      // Ignore errors when getting home directory
    }

    return fullPath;
  }

  updateDisplay() {
    if (!this.iconEl || !this.badgeEl) return;

    const count = this.externalContextPaths.length;
    if (count > 0) {
      this.iconEl.addClass('active');
      this.iconEl.setAttribute('title', `${count} external context${count > 1 ? 's' : ''} (click to add more)`);
      if (count > 1) {
        this.badgeEl.setText(String(count));
        this.badgeEl.addClass('visible');
      } else {
        this.badgeEl.removeClass('visible');
      }
      return;
    }

    this.iconEl.removeClass('active');
    this.iconEl.setAttribute('title', 'Add external contexts (click)');
    this.badgeEl.removeClass('visible');
  }
}

export class McpServerSelector {
  private container: HTMLElement;
  private iconEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private mcpService: McpService | null = null;
  private enabledServers: Set<string> = new Set();
  private onChangeCallback: ((enabled: Set<string>) => void) | null = null;

  constructor(parentEl: HTMLElement) {
    this.container = parentEl.createDiv({ cls: 'ocop-mcp-selector' });
    this.render();
  }

  setMcpService(service: McpService | null): void {
    this.mcpService = service;
    // Default ON: initialize with all globally-enabled servers
    if (service) {
      for (const server of service.getServers()) {
        if (server.enabled) {
          this.enabledServers.add(server.name);
        }
      }
    }
    this.pruneEnabledServers();
    this.updateDisplay();
    this.renderDropdown();
  }

  setOnChange(callback: (enabled: Set<string>) => void): void {
    this.onChangeCallback = callback;
  }

  getEnabledServers(): Set<string> {
    return new Set(this.enabledServers);
  }

  addMentionedServers(names: Set<string>): void {
    let changed = false;
    for (const name of names) {
      if (!this.enabledServers.has(name)) {
        this.enabledServers.add(name);
        changed = true;
      }
    }
    if (changed) {
      this.updateDisplay();
      this.renderDropdown();
    }
  }

  clearEnabled(): void {
    this.enabledServers.clear();
    this.updateDisplay();
    this.renderDropdown();
  }

  /** Reset to globally-enabled servers (default ON state). */
  resetToDefaults(): void {
    this.enabledServers.clear();
    if (this.mcpService) {
      for (const server of this.mcpService.getServers()) {
        if (server.enabled) {
          this.enabledServers.add(server.name);
        }
      }
    }
    this.updateDisplay();
    this.renderDropdown();
  }

  setEnabledServers(names: string[]): void {
    this.enabledServers = new Set(names);
    this.pruneEnabledServers();
    this.updateDisplay();
    this.renderDropdown();
  }

  private pruneEnabledServers(): void {
    if (!this.mcpService) return;
    // Only remove servers that are no longer configured at all.
    // Globally-disabled servers can still be per-session enabled.
    const configuredNames = new Set(this.mcpService.getServers().map((server) => server.name));
    let changed = false;
    for (const name of this.enabledServers) {
      if (!configuredNames.has(name)) {
        this.enabledServers.delete(name);
        changed = true;
      }
    }
    if (changed) {
      this.onChangeCallback?.(this.enabledServers);
    }
  }

  private render() {
    this.container.empty();
    const iconWrapper = this.container.createDiv({ cls: 'ocop-mcp-selector-icon-wrapper' });
    this.iconEl = iconWrapper.createDiv({ cls: 'ocop-mcp-selector-icon' });
    this.iconEl.innerHTML = MCP_ICON_SVG;
    this.badgeEl = iconWrapper.createDiv({ cls: 'ocop-mcp-selector-badge' });
    this.updateDisplay();
    this.dropdownEl = this.container.createDiv({ cls: 'ocop-mcp-selector-dropdown' });
    this.renderDropdown();
    this.container.addEventListener('mouseenter', () => {
      this.renderDropdown();
    });
  }

  private renderDropdown() {
    if (!this.dropdownEl) return;
    this.pruneEnabledServers();
    this.dropdownEl.empty();
    this.dropdownEl.createDiv({ cls: 'ocop-mcp-selector-header', text: 'MCP Servers' });
    const listEl = this.dropdownEl.createDiv({ cls: 'ocop-mcp-selector-list' });
    const servers = this.mcpService?.getServers() || [];

    if (servers.length === 0) {
      listEl.createDiv({
        cls: 'ocop-mcp-selector-empty',
        text: 'No MCP servers configured',
      });
      return;
    }

    for (const server of servers) {
      this.renderServerItem(listEl, server);
    }
  }

  private renderServerItem(listEl: HTMLElement, server: CopilotMcpServer) {
    const itemEl = listEl.createDiv({ cls: 'ocop-mcp-selector-item' });
    itemEl.dataset.serverName = server.name;
    const isSessionEnabled = this.enabledServers.has(server.name);
    if (isSessionEnabled) {
      itemEl.addClass('enabled');
    }

    const checkEl = itemEl.createDiv({ cls: 'ocop-mcp-selector-check' });
    if (isSessionEnabled) {
      checkEl.innerHTML = CHECK_ICON_SVG;
    }

    const infoEl = itemEl.createDiv({ cls: 'ocop-mcp-selector-item-info' });
    infoEl.createSpan({ cls: 'ocop-mcp-selector-item-name', text: server.name });

    if (server.contextSaving) {
      const csEl = infoEl.createSpan({ cls: 'ocop-mcp-selector-cs-badge', text: '@' });
      csEl.setAttribute('title', 'Context-saving: can also enable via @' + server.name);
    }

    itemEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleServer(server.name);
    });
  }

  private toggleServer(name: string) {
    if (this.enabledServers.has(name)) {
      this.enabledServers.delete(name);
    } else {
      this.enabledServers.add(name);
    }
    this.updateDisplay();
    this.renderDropdown();
    this.onChangeCallback?.(this.enabledServers);
  }

  updateDisplay() {
    this.pruneEnabledServers();
    if (!this.iconEl || !this.badgeEl) return;

    const count = this.enabledServers.size;
    const hasAnyServers = (this.mcpService?.getServers() || []).length > 0;
    if (!hasAnyServers) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = '';
    if (count > 0) {
      this.iconEl.addClass('active');
      this.iconEl.setAttribute('title', `${count} MCP server${count > 1 ? 's' : ''} enabled (click to manage)`);
      if (count > 1) {
        this.badgeEl.setText(String(count));
        this.badgeEl.addClass('visible');
      } else {
        this.badgeEl.removeClass('visible');
      }
      return;
    }

    this.iconEl.removeClass('active');
    this.iconEl.setAttribute('title', 'MCP servers (click to enable)');
    this.badgeEl.removeClass('visible');
  }
}

export class ContextUsageMeter {
  private container: HTMLElement;
  private fillPath: SVGPathElement | null = null;
  private percentEl: HTMLElement | null = null;
  private circumference = 0;

  constructor(parentEl: HTMLElement) {
    this.container = parentEl.createDiv({ cls: 'ocop-context-meter' });
    this.render();
    this.container.style.display = 'none';
  }

  private render() {
    const size = 16;
    const strokeWidth = 2;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const startAngle = 150;
    const endAngle = 390;
    const arcDegrees = endAngle - startAngle;
    const arcRadians = (arcDegrees * Math.PI) / 180;
    this.circumference = radius * arcRadians;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const gaugeEl = this.container.createDiv({ cls: 'ocop-context-meter-gauge' });
    gaugeEl.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <path class="ocop-meter-bg"
          d="M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}"
          fill="none" stroke-width="${strokeWidth}" stroke-linecap="round"/>
        <path class="ocop-meter-fill"
          d="M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}"
          fill="none" stroke-width="${strokeWidth}" stroke-linecap="round"
          stroke-dasharray="${this.circumference}" stroke-dashoffset="${this.circumference}"/>
      </svg>
    `;
    this.fillPath = gaugeEl.querySelector('.ocop-meter-fill');
    this.percentEl = this.container.createSpan({ cls: 'ocop-context-meter-percent' });
  }

  update(usage: UsageInfo | null): void {
    if (!usage) {
      this.container.style.display = 'none';
      return;
    }

    const premiumRequests = usage.premiumRequests ?? 0;
    if (usage.contextWindow <= 0) {
      if (premiumRequests <= 0) {
        this.container.style.display = 'none';
        return;
      }

      this.container.style.display = 'flex';
      if (this.fillPath) {
        this.fillPath.style.strokeDashoffset = String(this.circumference);
      }
      if (this.percentEl) {
        this.percentEl.setText(`P ${this.formatPremiumRequests(premiumRequests)}`);
      }
      this.container.removeClass('warning');
      this.container.setAttribute(
        'data-tooltip',
        `Local CLI observed premium usage: ${this.formatPremiumRequests(premiumRequests)} request${premiumRequests === 1 ? '' : 's'}`
      );
      return;
    }

    this.container.style.display = 'flex';
    const fillLength = (usage.percentage / 100) * this.circumference;
    if (this.fillPath) {
      this.fillPath.style.strokeDashoffset = String(this.circumference - fillLength);
    }
    if (this.percentEl) {
      this.percentEl.setText(`${usage.percentage}%`);
    }

    if (usage.percentage > 80) {
      this.container.addClass('warning');
    } else {
      this.container.removeClass('warning');
    }

    const tooltip = `Local CLI observed context: ${this.formatTokens(usage.contextTokens)} / ${this.formatTokens(usage.contextWindow)} tokens` +
      (premiumRequests > 0 ? ` • premium usage: ${this.formatPremiumRequests(premiumRequests)} request${premiumRequests === 1 ? '' : 's'}` : '');
    this.container.setAttribute('data-tooltip', tooltip);
  }

  private formatTokens(tokens: number): string {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return String(tokens);
  }

  private formatPremiumRequests(requests: number): string {
    if (Number.isInteger(requests)) {
      return String(requests);
    }
    return requests.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
}

export class WebSearchToggle {
  private container: HTMLElement;
  private enabled = false;

  constructor(parentEl: HTMLElement) {
    this.container = parentEl.createDiv({ cls: 'ocop-websearch-toggle' });
    this.render();
  }

  private valueEl: HTMLElement | null = null;

  private render() {
    this.container.empty();
    this.container.createSpan({ cls: 'ocop-thinking-label-text', text: 'Web:' });
    this.valueEl = this.container.createDiv({ cls: 'ocop-thinking-gears' });
    this.updateDisplay();
    this.container.addEventListener('click', () => {
      this.enabled = !this.enabled;
      this.updateDisplay();
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.updateDisplay();
  }

  updateDisplay() {
    if (!this.valueEl) return;
    this.valueEl.empty();
    const cls = this.enabled
      ? 'ocop-thinking-current ocop-thinking-active'
      : 'ocop-thinking-current ocop-thinking-disabled';
    this.valueEl.createDiv({ cls, text: this.enabled ? 'on' : 'off' });
    this.container.setAttribute('title', this.enabled
      ? 'Web search on (click to disable)'
      : 'Web search off (click to enable)');
  }
}

export function createInputToolbar(
  parentEl: HTMLElement,
  learningGroupEl: HTMLElement,
  callbacks: ToolbarCallbacks
): {
  modelSelector: ModelSelector;
  thinkingBudgetSelector: ThinkingBudgetSelector;
  contextUsageMeter: ContextUsageMeter;
  externalContextSelector: ExternalContextSelector;
  webSearchToggle: WebSearchToggle;
  mcpServerSelector: McpServerSelector;
  permissionToggle: PermissionToggle;
  quizLauncherButton: QuizLauncherButton;
  socraticLauncherButton: SocraticLauncherButton;
} {
  const modelSelector = new ModelSelector(parentEl, callbacks);
  const thinkingBudgetSelector = new ThinkingBudgetSelector(parentEl, callbacks);
  const contextUsageMeter = new ContextUsageMeter(parentEl);
  const externalContextSelector = new ExternalContextSelector(parentEl);
  const webSearchToggle = new WebSearchToggle(parentEl);
  const mcpServerSelector = new McpServerSelector(parentEl);
  const permissionToggle = new PermissionToggle(parentEl, callbacks);
  const quizLauncherButton = new QuizLauncherButton(learningGroupEl, callbacks);
  const socraticLauncherButton = new SocraticLauncherButton(learningGroupEl, callbacks);

  return {
    modelSelector,
    thinkingBudgetSelector,
    contextUsageMeter,
    externalContextSelector,
    webSearchToggle,
    mcpServerSelector,
    permissionToggle,
    quizLauncherButton,
    socraticLauncherButton,
  };
}

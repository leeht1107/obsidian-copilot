import { Notice, setIcon } from 'obsidian';

import type {
  ClaudeModel,
  ObsidianCodeMcpServer,
  PermissionMode,
  ThinkingBudget,
  UsageInfo,
} from '../../core/types';
import {
  DEFAULT_CLAUDE_MODELS,
  THINKING_BUDGETS,
} from '../../core/types';
import { CHECK_ICON_SVG, MCP_ICON_SVG } from '../../features/chat/constants';
import type { McpService } from '../../features/mcp/McpService';
import { getModelsFromEnvironment, parseEnvironmentVariables } from '../../utils/env';
import { findConflictingPath } from '../../utils/externalContext';

export interface ToolbarSettings {
  model: ClaudeModel;
  thinkingBudget: ThinkingBudget;
  permissionMode: PermissionMode;
  lastNonPlanPermissionMode?: 'yolo' | 'normal';
}

export interface ToolbarCallbacks {
  onModelChange: (model: ClaudeModel) => Promise<void>;
  onThinkingBudgetChange: (budget: ThinkingBudget) => Promise<void>;
  onPermissionModeChange: (mode: PermissionMode) => Promise<void>;
  getSettings: () => ToolbarSettings;
  getEnvironmentVariables?: () => string;
  isAgentInitiatedPlanMode?: () => boolean;
  isPlanModeRequested?: () => boolean;
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
    if (this.callbacks.getEnvironmentVariables) {
      const envVars = parseEnvironmentVariables(this.callbacks.getEnvironmentVariables());
      const customModels = getModelsFromEnvironment(envVars);
      if (customModels.length > 0) {
        return customModels;
      }
    }

    return [...DEFAULT_CLAUDE_MODELS];
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
  }

  renderOptions() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();

    const currentModel = this.callbacks.getSettings().model;
    const models = this.getAvailableModels();

    for (const model of [...models].reverse()) {
      const option = this.dropdownEl.createDiv({ cls: 'ocop-model-option' });
      if (model.value === currentModel) {
        option.addClass('selected');
      }

      option.createSpan({ text: model.label });
      if (model.description) {
        option.setAttribute('title', model.description);
        option.createSpan({ cls: 'ocop-model-desc', text: model.description });
      }

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

  private render() {
    this.container.empty();
    this.container.createSpan({ cls: 'ocop-thinking-label-text', text: 'Thinking:' });
    this.gearsEl = this.container.createDiv({ cls: 'ocop-thinking-gears' });
    this.renderGears();
  }

  private renderGears() {
    if (!this.gearsEl) return;
    this.gearsEl.empty();

    const currentBudget = this.callbacks.getSettings().thinkingBudget;
    const currentBudgetInfo = THINKING_BUDGETS.find((budget) => budget.value === currentBudget);
    this.gearsEl.createDiv({ cls: 'ocop-thinking-current', text: currentBudgetInfo?.label || 'Off' });

    const optionsEl = this.gearsEl.createDiv({ cls: 'ocop-thinking-options' });
    for (const budget of [...THINKING_BUDGETS].reverse()) {
      const gearEl = optionsEl.createDiv({ cls: 'ocop-thinking-gear' });
      gearEl.setText(budget.label);
      gearEl.setAttribute('title', budget.tokens > 0 ? `${budget.tokens.toLocaleString()} tokens` : 'Disabled');
      if (budget.value === currentBudget) {
        gearEl.addClass('selected');
      }

      gearEl.addEventListener('click', async (event) => {
        event.stopPropagation();
        await this.callbacks.onThinkingBudgetChange(budget.value);
        this.updateDisplay();
      });
    }
  }

  updateDisplay() {
    this.renderGears();
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
    } else if (mode === 'yolo') {
      this.toggleEl.addClass('active');
      this.labelEl.setText('AUTO');
    } else {
      this.toggleEl.removeClass('active');
      this.labelEl.setText('Safe');
    }
  }

  private async toggle() {
    const current = this.callbacks.getSettings().permissionMode;
    let next: PermissionMode;

    if (current === 'yolo') {
      next = 'plan';
    } else if (current === 'plan') {
      next = 'normal';
    } else {
      next = 'yolo';
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
      const electron = require('electron');
      const remote = electron.remote;
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
      const os = require('os');
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

  setEnabledServers(names: string[]): void {
    this.enabledServers = new Set(names);
    this.pruneEnabledServers();
    this.updateDisplay();
    this.renderDropdown();
  }

  private pruneEnabledServers(): void {
    if (!this.mcpService) return;
    const activeNames = new Set(this.mcpService.getServers().filter((server) => server.enabled).map((server) => server.name));
    let changed = false;
    for (const name of this.enabledServers) {
      if (!activeNames.has(name)) {
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
    const allServers = this.mcpService?.getServers() || [];
    const servers = allServers.filter((server) => server.enabled);

    if (servers.length === 0) {
      listEl.createDiv({
        cls: 'ocop-mcp-selector-empty',
        text: allServers.length === 0 ? 'No MCP servers configured' : 'All MCP servers disabled',
      });
      return;
    }

    for (const server of servers) {
      this.renderServerItem(listEl, server);
    }
  }

  private renderServerItem(listEl: HTMLElement, server: ObsidianCodeMcpServer) {
    const itemEl = listEl.createDiv({ cls: 'ocop-mcp-selector-item' });
    itemEl.dataset.serverName = server.name;
    const isEnabled = this.enabledServers.has(server.name);
    if (isEnabled) {
      itemEl.addClass('enabled');
    }

    const checkEl = itemEl.createDiv({ cls: 'ocop-mcp-selector-check' });
    if (isEnabled) {
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
      this.toggleServer(server.name, itemEl);
    });
  }

  private toggleServer(name: string, itemEl: HTMLElement) {
    if (this.enabledServers.has(name)) {
      this.enabledServers.delete(name);
    } else {
      this.enabledServers.add(name);
    }

    const isEnabled = this.enabledServers.has(name);
    const checkEl = itemEl.querySelector('.ocop-mcp-selector-check') as HTMLElement | null;
    if (isEnabled) {
      itemEl.addClass('enabled');
      if (checkEl) checkEl.innerHTML = CHECK_ICON_SVG;
    } else {
      itemEl.removeClass('enabled');
      if (checkEl) checkEl.innerHTML = '';
    }

    this.updateDisplay();
    this.onChangeCallback?.(this.enabledServers);
  }

  updateDisplay() {
    this.pruneEnabledServers();
    if (!this.iconEl || !this.badgeEl) return;

    const count = this.enabledServers.size;
    const hasServers = (this.mcpService?.getServers().length || 0) > 0;
    if (!hasServers) {
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

    this.container.setAttribute('data-tooltip', `${this.formatTokens(usage.contextTokens)} / ${this.formatTokens(usage.contextWindow)}`);
  }

  private formatTokens(tokens: number): string {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}k`;
    }
    return String(tokens);
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
  const thinkingBudgetSelector = new ThinkingBudgetSelector(parentEl, callbacks);
  const contextUsageMeter = new ContextUsageMeter(parentEl);
  const externalContextSelector = new ExternalContextSelector(parentEl);
  const mcpServerSelector = new McpServerSelector(parentEl);
  const permissionToggle = new PermissionToggle(parentEl, callbacks);

  return {
    modelSelector,
    thinkingBudgetSelector,
    contextUsageMeter,
    externalContextSelector,
    mcpServerSelector,
    permissionToggle,
  };
}

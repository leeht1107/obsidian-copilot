import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, setIcon } from 'obsidian';

import { SlashCommandManager } from '../../core/commands';
import type { CopilotModel, PermissionMode, ThinkingBudget } from '../../core/types';
import {
  COPILOT_MODELS,
  DEFAULT_THINKING_BUDGET,
  VIEW_TYPE_OBSIDIAN_CODE,
} from '../../core/types';
import type ObsidianCodePlugin from '../../main';
import {
  cleanupThinkingBlock,
  type ContextUsageMeter,
  createInputToolbar,
  type ExternalContextSelector,
  FileContextManager,
  ImageContextManager,
  type InstructionModeManager,
  InstructionModeManager as InstructionModeManagerClass,
  type McpServerSelector,
  type ModelSelector,
  type PermissionToggle,
  PlanBanner,
  SlashCommandDropdown,
  type ThinkingBudgetSelector,
  TodoPanel,
} from '../../ui';
import { getVaultPath } from '../../utils/path';
import { LOGO_SVG } from './constants';
import {
  ConversationController,
  InputController,
  NavigationController,
  SelectionController,
  StreamController,
} from './controllers';
import { MessageRenderer } from './rendering';
import { AsyncSubagentManager } from './services/AsyncSubagentManager';
import { InstructionRefineService } from './services/InstructionRefineService';
import { TitleGenerationService } from './services/TitleGenerationService';
import { ChatState } from './state';

export class ObsidianCodeView extends ItemView {
  private plugin: ObsidianCodePlugin;
  public readonly state: ChatState;

  private selectionController: SelectionController | null = null;
  private conversationController: ConversationController | null = null;
  private streamController: StreamController | null = null;
  private inputController: InputController | null = null;
  private navigationController: NavigationController | null = null;

  private renderer: MessageRenderer | null = null;

  private asyncSubagentManager: AsyncSubagentManager;
  private instructionRefineService: InstructionRefineService | null = null;
  private titleGenerationService: TitleGenerationService | null = null;

  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private inputWrapper: HTMLElement | null = null;
  private historyDropdown: HTMLElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private selectionIndicatorEl: HTMLElement | null = null;

  public fileContextManager: FileContextManager | null = null;
  private imageContextManager: ImageContextManager | null = null;
  private modelSelector: ModelSelector | null = null;
  private thinkingBudgetSelector: ThinkingBudgetSelector | null = null;
  private externalContextSelector: ExternalContextSelector | null = null;
  private mcpServerSelector: McpServerSelector | null = null;
  private permissionToggle: PermissionToggle | null = null;
  private slashCommandManager: SlashCommandManager | null = null;
  private slashCommandDropdown: SlashCommandDropdown | null = null;
  private instructionModeManager: InstructionModeManager | null = null;
  private contextUsageMeter: ContextUsageMeter | null = null;
  private planBanner: PlanBanner | null = null;
  private todoPanel: TodoPanel | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianCodePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = new ChatState({
      onUsageChanged: (usage) => this.contextUsageMeter?.update(usage),
      onTodosChanged: (todos) => this.todoPanel?.updateTodos(todos),
    });
    this.asyncSubagentManager = new AsyncSubagentManager(
      (subagent) => this.streamController?.onAsyncSubagentStateChange(subagent)
    );
  }

  getViewType(): string {
    return VIEW_TYPE_OBSIDIAN_CODE;
  }

  getDisplayText(): string {
    return 'Obsidian Copilot';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ocop-container');

    const header = container.createDiv({ cls: 'ocop-header' });
    this.buildHeader(header);

    this.planBanner = new PlanBanner({
      app: this.plugin.app,
      component: this,
    });
    this.planBanner.mount(container);

    this.messagesEl = container.createDiv({ cls: 'ocop-messages' });
    this.welcomeEl = this.messagesEl.createDiv({ cls: 'ocop-welcome' });

    this.todoPanel = new TodoPanel();
    this.todoPanel.mount(this.messagesEl);

    const inputContainerEl = container.createDiv({ cls: 'ocop-input-container' });
    this.buildInputArea(inputContainerEl);

    this.renderer = new MessageRenderer(this.plugin.app, this, this.messagesEl);

    this.initializeControllers();
    this.wireEventHandlers();

    this.selectionController?.start();

    await this.conversationController?.createNew();
  }

  async onClose() {
    this.selectionController?.stop();
    this.selectionController?.clear();
    this.navigationController?.dispose();

    cleanupThinkingBlock(this.state.currentThinkingState);
    this.state.currentThinkingState = null;

    this.plugin.agentService.setApprovalCallback(null);
    this.plugin.agentService.setAskUserQuestionCallback(null);

    this.fileContextManager?.destroy();
    this.slashCommandDropdown?.destroy();
    this.slashCommandDropdown = null;
    this.slashCommandManager = null;
    this.instructionModeManager?.destroy();
    this.instructionModeManager = null;
    this.instructionRefineService?.cancel();
    this.instructionRefineService = null;
    this.titleGenerationService?.cancel();
    this.titleGenerationService = null;
    this.todoPanel?.destroy();
    this.todoPanel = null;

    this.asyncSubagentManager.orphanAllActive();
    this.state.asyncSubagentStates.clear();

    await this.conversationController?.save();
  }

  private buildHeader(header: HTMLElement) {
    const titleContainer = header.createDiv({ cls: 'ocop-title' });
    const logoEl = titleContainer.createSpan({ cls: 'ocop-logo' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', LOGO_SVG.viewBox);
    svg.setAttribute('width', LOGO_SVG.width);
    svg.setAttribute('height', LOGO_SVG.height);
    svg.setAttribute('fill', 'none');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', LOGO_SVG.path);
    pathEl.setAttribute('fill', LOGO_SVG.fill);
    svg.appendChild(pathEl);
    logoEl.appendChild(svg);
    titleContainer.createEl('h4', { text: 'Obsidian Copilot' });

    const headerActions = header.createDiv({ cls: 'ocop-header-actions' });

    const historyContainer = headerActions.createDiv({ cls: 'ocop-history-container' });
    const trigger = historyContainer.createDiv({ cls: 'ocop-header-btn' });
    setIcon(trigger, 'history');
    trigger.setAttribute('aria-label', 'Chat history');

    this.historyDropdown = historyContainer.createDiv({ cls: 'ocop-history-menu' });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.conversationController?.toggleHistoryDropdown();
    });

    const newBtn = headerActions.createDiv({ cls: 'ocop-header-btn' });
    setIcon(newBtn, 'plus');
    newBtn.setAttribute('aria-label', 'New conversation');
    newBtn.addEventListener('click', () => this.conversationController?.createNew());
  }

  private buildInputArea(inputContainerEl: HTMLElement) {
    this.inputWrapper = inputContainerEl.createDiv({ cls: 'ocop-input-wrapper' });

    this.selectionIndicatorEl = this.inputWrapper.createDiv({ cls: 'ocop-selection-indicator' });
    this.selectionIndicatorEl.style.display = 'none';

    this.inputEl = this.inputWrapper.createEl('textarea', {
      cls: 'ocop-input',
      attr: {
        placeholder: 'Ask Copilot about this note or attached files...',
        rows: '3',
      },
    });

    this.fileContextManager = new FileContextManager(
      this.plugin.app,
      inputContainerEl,
      this.inputEl,
      {
        getExcludedTags: () => this.plugin.settings.excludedTags,
        onChipsChanged: () => this.renderer?.scrollToBottomIfNeeded(),
        getExternalContexts: () => this.externalContextSelector?.getExternalContexts() || [],
      }
    );
    this.fileContextManager.setMcpService(this.plugin.mcpService);

    this.imageContextManager = new ImageContextManager(
      this.plugin.app,
      inputContainerEl,
      this.inputEl,
      {
        onImagesChanged: () => this.renderer?.scrollToBottomIfNeeded(),
      }
    );

    const vaultPath = getVaultPath(this.plugin.app);
    if (vaultPath) {
      this.slashCommandManager = new SlashCommandManager(this.plugin.app, vaultPath);
      this.slashCommandManager.setCommands(this.plugin.settings.slashCommands);

      this.slashCommandDropdown = new SlashCommandDropdown(
        inputContainerEl,
        this.inputEl,
        {
          onSelect: () => {},
          onHide: () => {},
          getCommands: () => this.plugin.settings.slashCommands,
        }
      );
    }

    this.instructionRefineService = new InstructionRefineService(this.plugin);
    this.titleGenerationService = new TitleGenerationService(this.plugin);
    this.instructionModeManager = new InstructionModeManagerClass(
      this.inputEl,
      {
        onSubmit: async (rawInstruction) => {
          await this.inputController?.handleInstructionSubmit(rawInstruction);
        },
        getInputWrapper: () => this.inputWrapper,
      }
    );

    const inputToolbar = this.inputWrapper.createDiv({ cls: 'ocop-input-toolbar' });
    const toolbarComponents = createInputToolbar(inputToolbar, {
      getSettings: () => ({
        model: this.plugin.settings.model,
        thinkingBudget: this.plugin.settings.thinkingBudget,
        permissionMode: this.plugin.settings.permissionMode,
        lastNonPlanPermissionMode: this.plugin.settings.lastNonPlanPermissionMode,
      }),
      getEnvironmentVariables: () => this.plugin.getActiveEnvironmentVariables(),
      isAgentInitiatedPlanMode: () => this.state.planModeState?.agentInitiated ?? false,
      isPlanModeRequested: () => this.state.planModeRequested,
      onModelChange: async (model: CopilotModel) => {
        this.plugin.settings.model = model;
        const isDefaultModel = COPILOT_MODELS.find((m: any) => m.value === model);
        if (isDefaultModel) {
          this.plugin.settings.thinkingBudget = DEFAULT_THINKING_BUDGET[model];
        }
        await this.plugin.saveSettings();
        this.thinkingBudgetSelector?.updateDisplay();
        this.modelSelector?.updateDisplay();
        this.modelSelector?.renderOptions();
      },
      onThinkingBudgetChange: async (budget: ThinkingBudget) => {
        this.plugin.settings.thinkingBudget = budget;
        await this.plugin.saveSettings();
      },
      onPermissionModeChange: async (mode: PermissionMode) => {
        const current = this.plugin.settings.permissionMode;
        if (mode === 'plan') {
          if (current !== 'plan') {
            this.plugin.settings.lastNonPlanPermissionMode = current;
          }
        } else {
          this.plugin.settings.lastNonPlanPermissionMode = mode;
        }

        this.plugin.settings.permissionMode = mode;
        await this.plugin.saveSettings();

        if (mode === 'plan') {
          if (!this.state.planModeState?.isActive) {
            this.state.planModeState = {
              isActive: true,
              planFilePath: null,
              planContent: null,
              originalQuery: null,
              agentInitiated: true,
            };
          }
        } else {
          this.state.resetPlanModeState();
        }

        this.updatePlanModeUiState();
      },
    });

    this.modelSelector = toolbarComponents.modelSelector;
    this.thinkingBudgetSelector = toolbarComponents.thinkingBudgetSelector;
    this.contextUsageMeter = toolbarComponents.contextUsageMeter;
    this.externalContextSelector = toolbarComponents.externalContextSelector;
    this.mcpServerSelector = toolbarComponents.mcpServerSelector;
    this.permissionToggle = toolbarComponents.permissionToggle;

    this.mcpServerSelector.setMcpService(this.plugin.mcpService);

    this.fileContextManager?.setOnMcpMentionChange((servers) => {
      this.mcpServerSelector?.addMentionedServers(servers);
    });

    this.externalContextSelector.setOnChange(() => {
      this.fileContextManager?.preScanExternalContexts();
    });
  }

  private initializeControllers() {
    this.selectionController = new SelectionController(
      this.plugin.app,
      this.selectionIndicatorEl!,
      this.inputEl!
    );

    this.streamController = new StreamController({
      plugin: this.plugin,
      state: this.state,
      renderer: this.renderer!,
      asyncSubagentManager: this.asyncSubagentManager,
      getMessagesEl: () => this.messagesEl!,
      getFileContextManager: () => this.fileContextManager,
      updateQueueIndicator: () => this.inputController?.updateQueueIndicator(),
      setPlanModeActive: () => {
        this.updatePlanModeUiState();
      },
    });

    this.conversationController = new ConversationController(
      {
        plugin: this.plugin,
        state: this.state,
        renderer: this.renderer!,
        asyncSubagentManager: this.asyncSubagentManager,
        getHistoryDropdown: () => this.historyDropdown,
        getWelcomeEl: () => this.welcomeEl,
        setWelcomeEl: (el) => {
          this.welcomeEl = el;
        },
        getMessagesEl: () => this.messagesEl!,
        getInputEl: () => this.inputEl!,
        getFileContextManager: () => this.fileContextManager,
        getImageContextManager: () => this.imageContextManager,
        getMcpServerSelector: () => this.mcpServerSelector,
        getExternalContextSelector: () => this.externalContextSelector,
        clearQueuedMessage: () => this.inputController?.clearQueuedMessage(),
        getApprovedPlan: () => this.plugin.agentService.getApprovedPlanContent(),
        setApprovedPlan: (plan) => this.plugin.agentService.setApprovedPlanContent(plan),
        showPlanBanner: (content) => {
          void this.planBanner?.show(content);
        },
        hidePlanBanner: () => this.planBanner?.hide(),
        triggerPendingPlanApproval: (content) => this.inputController?.restorePendingPlanApproval(content),
        getTitleGenerationService: () => this.titleGenerationService,
        setPlanModeActive: () => {
          this.updatePlanModeUiState();
        },
        getTodoPanel: () => this.todoPanel,
      },
      {}
    );

    this.inputController = new InputController({
      plugin: this.plugin,
      state: this.state,
      renderer: this.renderer!,
      streamController: this.streamController,
      selectionController: this.selectionController,
      conversationController: this.conversationController,
      getInputEl: () => this.inputEl!,
      getWelcomeEl: () => this.welcomeEl,
      getMessagesEl: () => this.messagesEl!,
      getFileContextManager: () => this.fileContextManager,
      getImageContextManager: () => this.imageContextManager,
      getSlashCommandManager: () => this.slashCommandManager,
      getMcpServerSelector: () => this.mcpServerSelector,
      getExternalContextSelector: () => this.externalContextSelector,
      getInstructionModeManager: () => this.instructionModeManager,
      getInstructionRefineService: () => this.instructionRefineService,
      getTitleGenerationService: () => this.titleGenerationService,
      getComponent: () => this,
      setPlanModeActive: () => {
        this.updatePlanModeUiState();
      },
      getPlanBanner: () => this.planBanner,
      generateId: () => this.generateId(),
      resetContextMeter: () => this.contextUsageMeter?.update(null),
    });

    this.permissionToggle?.setOnPlanModeToggle((active) => {
      this.inputController?.setPlanModeRequested(active);
    });

    this.plugin.agentService.setApprovalCallback(
      (toolName, input, description) => this.inputController!.handleApprovalRequest(toolName, input, description)
    );

    this.plugin.agentService.setAskUserQuestionCallback(
      (input) => this.inputController!.handleAskUserQuestion(input)
    );

    this.plugin.agentService.setExitPlanModeCallback(
      (planContent) => this.inputController!.handleExitPlanMode(planContent)
    );

    this.plugin.agentService.setEnterPlanModeCallback(
      () => this.inputController!.handleEnterPlanMode()
    );

    this.navigationController = new NavigationController({
      getMessagesEl: () => this.messagesEl!,
      getInputEl: () => this.inputEl!,
      getSettings: () => this.plugin.settings.keyboardNavigation,
      isStreaming: () => this.state.isStreaming,
      shouldSkipEscapeHandling: () => {
        if (this.instructionModeManager?.isActive()) return true;
        if (this.slashCommandDropdown?.isVisible()) return true;
        if (this.fileContextManager?.isMentionDropdownVisible()) return true;
        return false;
      },
    });
    this.navigationController.initialize();
  }

  private wireEventHandlers() {
    this.registerDomEvent(document, 'click', () => {
      this.historyDropdown?.removeClass('visible');
    });

    this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.state.isStreaming) {
        e.preventDefault();
        this.inputController?.cancelStreaming();
      }
    });

    this.registerEvent(this.plugin.app.vault.on('create', () => this.fileContextManager?.markFilesCacheDirty()));
    this.registerEvent(this.plugin.app.vault.on('delete', () => this.fileContextManager?.markFilesCacheDirty()));
    this.registerEvent(this.plugin.app.vault.on('rename', () => this.fileContextManager?.markFilesCacheDirty()));
    this.registerEvent(this.plugin.app.vault.on('modify', () => this.fileContextManager?.markFilesCacheDirty()));

    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file) {
          this.fileContextManager?.handleFileOpen(file);
        }
      })
    );

    this.registerDomEvent(document, 'click', (e) => {
      if (!this.fileContextManager?.containsElement(e.target as Node) && e.target !== this.inputEl) {
        this.fileContextManager?.hideMentionDropdown();
      }
    });

    this.inputEl!.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && e.shiftKey && !this.state.isStreaming) {
        e.preventDefault();
        e.stopPropagation();
        this.permissionToggle?.togglePlanMode();
      }
    }, { capture: true });

    this.inputEl!.addEventListener('keydown', (e) => {
      if (this.instructionModeManager?.handleTriggerKey(e)) {
        return;
      }

      if (this.instructionModeManager?.handleKeydown(e)) {
        return;
      }

      if (this.slashCommandDropdown?.handleKeydown(e)) {
        return;
      }

      if (this.fileContextManager?.handleMentionKeydown(e)) {
        return;
      }

      if (e.key === 'Escape' && this.state.isStreaming) {
        e.preventDefault();
        this.inputController?.cancelStreaming();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (this.permissionToggle?.isPlanModeActive()) {
          void this.inputController?.sendPlanModeMessage();
        } else {
          void this.inputController?.sendMessage();
        }
      }
    });

    this.inputEl!.addEventListener('input', () => {
      this.fileContextManager?.handleInputChange();
      this.instructionModeManager?.handleInputChange();
    });

    this.inputEl!.addEventListener('focus', () => {
      this.selectionController?.showHighlight();
    });
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private updatePlanModeUiState(): void {
    const isPlanMode = this.plugin.settings.permissionMode === 'plan';
    const isPlanModeRequested = this.state.planModeRequested;
    this.permissionToggle?.setPlanModeActive(isPlanMode || isPlanModeRequested);
  }
}

import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, setIcon } from 'obsidian';

import type { ClaudeModel } from '../../core/types';
import { VIEW_TYPE_OBSIDIAN_CODE } from '../../core/types';
import type ObsidianCodePlugin from '../../main';
import {
  cleanupThinkingBlock,
  type ContextUsageMeter,
  createInputToolbar,
  FileContextManager,
  ImageContextManager,
  type ModelSelector,
} from '../../ui';
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
  private contextUsageMeter: ContextUsageMeter | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianCodePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = new ChatState({
      onUsageChanged: (usage) => this.contextUsageMeter?.update(usage),
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
    container.addClass('oc-container');

    const header = container.createDiv({ cls: 'oc-header' });
    this.buildHeader(header);

    this.messagesEl = container.createDiv({ cls: 'oc-messages' });
    this.welcomeEl = this.messagesEl.createDiv({ cls: 'oc-welcome' });

    const inputContainerEl = container.createDiv({ cls: 'oc-input-container' });
    this.buildInputArea(inputContainerEl);

    this.renderer = new MessageRenderer(this.plugin.app, this, this.messagesEl);
    this.initializeControllers();
    this.wireEventHandlers();

    this.selectionController?.start();
    await this.conversationController?.loadActive();
  }

  async onClose() {
    this.selectionController?.stop();
    this.selectionController?.clear();
    this.navigationController?.dispose();
    cleanupThinkingBlock(this.state.currentThinkingState);
    this.state.currentThinkingState = null;

    this.fileContextManager?.destroy();
    this.titleGenerationService?.cancel();
    this.titleGenerationService = null;

    this.asyncSubagentManager.orphanAllActive();
    this.state.asyncSubagentStates.clear();
    await this.conversationController?.save();
  }

  private buildHeader(header: HTMLElement) {
    const titleContainer = header.createDiv({ cls: 'oc-title' });
    const logoEl = titleContainer.createSpan({ cls: 'oc-logo' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', LOGO_SVG.viewBox);
    svg.setAttribute('width', LOGO_SVG.width);
    svg.setAttribute('height', LOGO_SVG.height);
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', LOGO_SVG.path);
    path.setAttribute('fill', LOGO_SVG.fill);
    svg.appendChild(path);
    logoEl.appendChild(svg);
    titleContainer.createEl('h4', { text: 'Obsidian Copilot' });

    const headerActions = header.createDiv({ cls: 'oc-header-actions' });

    const historyContainer = headerActions.createDiv({ cls: 'oc-history-container' });
    const trigger = historyContainer.createDiv({ cls: 'oc-header-btn' });
    setIcon(trigger, 'history');
    trigger.setAttribute('aria-label', 'Chat history');

    this.historyDropdown = historyContainer.createDiv({ cls: 'oc-history-menu' });

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      this.conversationController?.toggleHistoryDropdown();
    });

    const newBtn = headerActions.createDiv({ cls: 'oc-header-btn' });
    setIcon(newBtn, 'plus');
    newBtn.setAttribute('aria-label', 'New conversation');
    newBtn.addEventListener('click', () => this.conversationController?.createNew());
  }

  private buildInputArea(inputContainerEl: HTMLElement) {
    this.inputWrapper = inputContainerEl.createDiv({ cls: 'oc-input-wrapper' });

    this.selectionIndicatorEl = this.inputWrapper.createDiv({ cls: 'oc-selection-indicator' });
    this.selectionIndicatorEl.style.display = 'none';

    this.inputEl = this.inputWrapper.createEl('textarea', {
      cls: 'oc-input',
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
        getExternalContexts: () => [],
      }
    );

    this.imageContextManager = new ImageContextManager(
      this.plugin.app,
      inputContainerEl,
      this.inputEl,
      {
        onImagesChanged: () => this.renderer?.scrollToBottomIfNeeded(),
      }
    );

    this.titleGenerationService = new TitleGenerationService(this.plugin);

    const inputToolbar = this.inputWrapper.createDiv({ cls: 'oc-input-toolbar' });
    const toolbarComponents = createInputToolbar(inputToolbar, {
      getSettings: () => ({
        model: this.plugin.settings.model,
      }),
      onModelChange: async (model: ClaudeModel) => {
        this.plugin.settings.model = model;
        await this.plugin.saveSettings();
        this.modelSelector?.updateDisplay();
        this.modelSelector?.renderOptions();
      },
    });

    this.modelSelector = toolbarComponents.modelSelector;
    this.contextUsageMeter = toolbarComponents.contextUsageMeter;
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
      setPlanModeActive: () => {},
    });

    this.conversationController = new ConversationController(
      {
        plugin: this.plugin,
        state: this.state,
        renderer: this.renderer!,
        asyncSubagentManager: this.asyncSubagentManager,
        getHistoryDropdown: () => this.historyDropdown,
        getWelcomeEl: () => this.welcomeEl,
        setWelcomeEl: (el) => { this.welcomeEl = el; },
        getMessagesEl: () => this.messagesEl!,
        getInputEl: () => this.inputEl!,
        getFileContextManager: () => this.fileContextManager,
        getImageContextManager: () => this.imageContextManager,
        getMcpServerSelector: () => null,
        getExternalContextSelector: () => null,
        clearQueuedMessage: () => this.inputController?.clearQueuedMessage(),
        getApprovedPlan: () => null,
        setApprovedPlan: () => {},
        showPlanBanner: () => {},
        hidePlanBanner: () => {},
        triggerPendingPlanApproval: () => {},
        getTitleGenerationService: () => this.titleGenerationService,
        setPlanModeActive: () => {},
        getTodoPanel: () => null,
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
      getSlashCommandManager: () => null,
      getMcpServerSelector: () => null,
      getExternalContextSelector: () => null,
      getInstructionModeManager: () => null,
      getInstructionRefineService: () => null,
      getTitleGenerationService: () => this.titleGenerationService,
      getComponent: () => this,
      setPlanModeActive: () => {},
      getPlanBanner: () => null,
      generateId: () => this.generateId(),
      resetContextMeter: () => this.contextUsageMeter?.update(null),
    });

    this.navigationController = new NavigationController({
      getMessagesEl: () => this.messagesEl!,
      getInputEl: () => this.inputEl!,
      getSettings: () => this.plugin.settings.keyboardNavigation,
      isStreaming: () => this.state.isStreaming,
      shouldSkipEscapeHandling: () => this.fileContextManager?.isMentionDropdownVisible() ?? false,
    });
    this.navigationController.initialize();
  }

  private wireEventHandlers() {
    this.registerDomEvent(document, 'click', () => {
      this.historyDropdown?.removeClass('visible');
    });

    this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.state.isStreaming) {
        event.preventDefault();
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

    this.registerDomEvent(document, 'click', (event) => {
      if (!this.fileContextManager?.containsElement(event.target as Node) && event.target !== this.inputEl) {
        this.fileContextManager?.hideMentionDropdown();
      }
    });

    this.inputEl!.addEventListener('keydown', (event) => {
      if (this.fileContextManager?.handleMentionKeydown(event)) {
        return;
      }

      if (event.key === 'Escape' && this.state.isStreaming) {
        event.preventDefault();
        this.inputController?.cancelStreaming();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.inputController?.sendMessage();
      }
    });

    this.inputEl!.addEventListener('input', () => {
      this.fileContextManager?.handleInputChange();
    });

    this.inputEl!.addEventListener('focus', () => {
      this.selectionController?.showHighlight();
    });
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

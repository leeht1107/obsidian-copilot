/**
 * Stream controller for handling SDK stream chunks.
 *
 * Manages real-time message updates, tool call rendering, subagent
 * state tracking, and thinking indicator display.
 */

import {
  normalizeQuizMarkdown,
  parseQuizQuestionMeta,
  parseSocraticMeta,
} from '../../../core/learning';
import { isPlanModeTool, isWriteEditTool, TOOL_AGENT_OUTPUT, TOOL_ASK_USER_QUESTION, TOOL_TASK, TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { AskUserQuestionQuestion, ChatMessage, StreamChunk, SubagentInfo, ToolCallInfo } from '../../../core/types';
import type ObsidianCopilotPlugin from '../../../main';
import {
  addSubagentToolCall,
  appendThinkingContent,
  type AsyncSubagentState,
  createAskUserQuestionBlock,
  createAsyncSubagentBlock,
  createSubagentBlock,
  createThinkingBlock,
  createWriteEditBlock,
  type FileContextManager,
  finalizeAskUserQuestionBlock,
  finalizeAsyncSubagent,
  finalizeSubagentBlock,
  finalizeThinkingBlock,
  finalizeWriteEditBlock,
  isBlockedToolResult,
  markAsyncSubagentOrphaned,
  parseAskUserQuestionInput,
  parseTodoInput,
  renderToolCall,
  type SubagentState,
  updateAsyncSubagentRunning,
  updateSubagentToolResult,
  updateToolCallResult,
  updateWriteEditWithDiff,
} from '../../../ui';
import type { MessageRenderer } from '../rendering/MessageRenderer';
import type { AsyncSubagentManager } from '../services/AsyncSubagentManager';
import type { ChatState } from '../state/ChatState';

/** Dependencies for StreamController. */
export interface StreamControllerDeps {
  plugin: ObsidianCopilotPlugin;
  state: ChatState;
  renderer: MessageRenderer;
  asyncSubagentManager: AsyncSubagentManager;
  getMessagesEl: () => HTMLElement;
  getFileContextManager: () => FileContextManager | null;
  updateQueueIndicator: () => void;
  /** Callback to set plan mode active (for UI toggle sync). */
  setPlanModeActive: (active: boolean) => void;
}

/**
 * StreamController handles all stream chunk processing.
 */
export class StreamController {
  private deps: StreamControllerDeps;
  private pendingScrollFrameId: number | ReturnType<typeof setTimeout> | null = null;

  constructor(deps: StreamControllerDeps) {
    this.deps = deps;
  }

  // ============================================
  // Stream Chunk Handling
  // ============================================

  /** Processes a stream chunk and updates the message. */
  async handleStreamChunk(chunk: StreamChunk, msg: ChatMessage): Promise<void> {
    const { state, plugin } = this.deps;

    // Route subagent chunks
    if ('parentToolUseId' in chunk && chunk.parentToolUseId) {
      await this.handleSubagentChunk(chunk, msg);
      this.queueScrollToBottom();
      return;
    }

    switch (chunk.type) {
      case 'thinking':
        if (state.currentTextEl) {
          await this.finalizeCurrentTextBlock(msg);
        }
        await this.appendThinking(chunk.content, msg);
        break;

      case 'text':
        if (state.currentThinkingState) {
          this.finalizeCurrentThinkingBlock(msg);
        }
        msg.content += chunk.content;
        await this.appendText(chunk.content);
        if (state.currentContentEl) {
          this.showThinkingIndicator(state.currentContentEl);
        }
        break;

      case 'tool_use': {
        if (state.currentThinkingState) {
          this.finalizeCurrentThinkingBlock(msg);
        }
        await this.finalizeCurrentTextBlock(msg);

        if (chunk.name === TOOL_TASK) {
          // Track subagent spawn for usage filtering
          state.subagentsSpawnedThisStream++;
          const isAsync = this.deps.asyncSubagentManager.isAsyncTask(chunk.input);
          if (isAsync) {
            await this.handleAsyncTaskToolUse(chunk, msg);
          } else {
            await this.handleTaskToolUse(chunk, msg);
          }
          break;
        }

        if (chunk.name === TOOL_AGENT_OUTPUT) {
          this.handleAgentOutputToolUse(chunk, msg);
          break;
        }

        if (chunk.name === TOOL_ASK_USER_QUESTION) {
          await this.handleAskUserQuestionToolUse(chunk, msg);
          break;
        }

        // Handle plan mode tools (EnterPlanMode, ExitPlanMode)
        if (isPlanModeTool(chunk.name)) {
          // Skip rendering - these tools are invisible to the user
          break;
        }

        this.handleRegularToolUse(chunk, msg);
        break;
      }

      case 'tool_result': {
        this.handleToolResult(chunk, msg);
        break;
      }

      case 'blocked':
        await this.appendText(`\n\n⚠️ **Blocked:** ${chunk.content}`);
        break;

      case 'error':
        await this.appendText(`\n\n❌ **Error:** ${chunk.content}`);
        break;

      case 'done':
        // Choice button injection is deferred to post-finalize (called from InputController)
        break;

      case 'usage': {
        // Skip usage updates from other sessions or when flagged (during session reset)
        const currentSessionId = plugin.agentService.getSessionId();
        const chunkSessionId = chunk.sessionId ?? null;
        if (
          (chunkSessionId && currentSessionId && chunkSessionId !== currentSessionId) ||
          (chunkSessionId && !currentSessionId)
        ) {
          break;
        }
        // Skip usage updates when subagents ran (SDK reports cumulative usage including subagents)
        if (state.subagentsSpawnedThisStream > 0) {
          break;
        }
        if (!state.ignoreUsageUpdates) {
          const previousUsage = state.usage;
          state.usage = previousUsage
            ? {
                ...chunk.usage,
                premiumRequests: (previousUsage.premiumRequests ?? 0) + (chunk.usage.premiumRequests ?? 0),
              }
            : chunk.usage;
        }
        break;
      }
    }

    this.queueScrollToBottom();
  }

  // ============================================
  // Tool Use Handling
  // ============================================

  /** Handles regular tool_use chunks. */
  private handleRegularToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage
  ): void {
    const { plugin, state } = this.deps;

    // Skip rendering Write/Edit tools during plan mode (read-only mode)
    const isPlanMode = plugin.settings.permissionMode === 'plan';
    if (isPlanMode && isWriteEditTool(chunk.name)) {
      return;
    }

    const toolCall: ToolCallInfo = {
      id: chunk.id,
      name: chunk.name,
      input: chunk.input,
      status: 'running',
      isExpanded: false,
    };
    msg.toolCalls = msg.toolCalls || [];
    msg.toolCalls.push(toolCall);

    // TodoWrite always updates the persistent bottom panel
    if (chunk.name === TOOL_TODO_WRITE) {
      const todos = parseTodoInput(chunk.input);
      if (todos) {
        this.deps.state.currentTodos = todos;
      } else {
        console.warn('[StreamController] TodoWrite input parsing failed', {
          toolId: chunk.id,
          inputKeys: Object.keys(chunk.input),
        });
        // Parsing failed - render as raw tool call for debugging
        if (state.currentContentEl) {
          msg.contentBlocks = msg.contentBlocks || [];
          msg.contentBlocks.push({ type: 'tool_use', toolId: chunk.id });
          renderToolCall(state.currentContentEl, toolCall, state.toolCallElements);
        }
      }
    } else if (state.currentContentEl) {
      msg.contentBlocks = msg.contentBlocks || [];
      msg.contentBlocks.push({ type: 'tool_use', toolId: chunk.id });

      if (isWriteEditTool(chunk.name)) {
        const writeEditState = createWriteEditBlock(state.currentContentEl, toolCall);
        state.writeEditStates.set(chunk.id, writeEditState);
        state.toolCallElements.set(chunk.id, writeEditState.wrapperEl);
      } else {
        renderToolCall(state.currentContentEl, toolCall, state.toolCallElements);
      }
    }

    if (state.currentContentEl) {
      this.showThinkingIndicator(state.currentContentEl);
    }
  }

  /** Handles AskUserQuestion tool_use chunks. */
  private async handleAskUserQuestionToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage
  ): Promise<void> {
    const { state } = this.deps;
    if (!this.deps.plugin.agentService.isAskUserQuestionToolSupported()) {
      const parsedInput = parseAskUserQuestionInput(chunk.input);
      await this.appendText(`\n\n${this.formatAskUserQuestionFallback(parsedInput?.questions)}`);
      return;
    }

    if (!state.currentContentEl) return;

    const toolCall: ToolCallInfo = {
      id: chunk.id,
      name: chunk.name,
      input: chunk.input,
      status: 'running',
      isExpanded: false,
    };
    msg.toolCalls = msg.toolCalls || [];
    msg.toolCalls.push(toolCall);

    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'tool_use', toolId: chunk.id });

    const askQuestionState = createAskUserQuestionBlock(state.currentContentEl, toolCall);
    state.askUserQuestionStates.set(chunk.id, askQuestionState);
    state.toolCallElements.set(chunk.id, askQuestionState.wrapperEl);

    this.showThinkingIndicator(state.currentContentEl);
  }

  private formatAskUserQuestionFallback(questions?: AskUserQuestionQuestion[]): string {
    const firstQuestion = questions?.[0];
    if (!firstQuestion) {
      return 'I need your input before continuing. Please reply in chat.';
    }

    const optionLabels = firstQuestion.options.map((option) => option.label).filter(Boolean);
    const optionHint = optionLabels.length > 0 ? ` Options: ${optionLabels.join(', ')}.` : '';
    return `${firstQuestion.question}${optionHint} Reply in chat and I will continue.`;
  }

  /** Handles tool_result chunks. */
  private handleToolResult(
    chunk: { type: 'tool_result'; id: string; content: string; isError?: boolean; toolName?: string | null },
    msg: ChatMessage
  ): void {
    const { plugin, state } = this.deps;

    // Check if it's a sync subagent result
    const subagentState = state.activeSubagents.get(chunk.id);
    if (subagentState) {
      this.finalizeSubagent(chunk, msg, subagentState);
      return;
    }

    // Check if it's an async task result
    if (this.handleAsyncTaskToolResult(chunk, msg)) {
      if (state.currentContentEl) {
        this.showThinkingIndicator(state.currentContentEl);
      }
      return;
    }

    // Check if it's an agent output result
    if (this.handleAgentOutputToolResult(chunk, msg)) {
      if (state.currentContentEl) {
        this.showThinkingIndicator(state.currentContentEl);
      }
      return;
    }

    const existingToolCall = msg.toolCalls?.find(tc => tc.id === chunk.id);
    const askQuestionState = state.askUserQuestionStates.get(chunk.id);

    // Check if it's an AskUserQuestion result
    if (existingToolCall?.name === TOOL_ASK_USER_QUESTION || askQuestionState) {
      const isBlocked = isBlockedToolResult(chunk.content, chunk.isError);
      if (existingToolCall) {
        existingToolCall.status = isBlocked ? 'blocked' : (chunk.isError ? 'error' : 'completed');
        existingToolCall.result = chunk.content;
      }

      // Get answers from stored map (set by ObsidianCodeService callback)
      const storedAnswers = plugin.agentService.getAskUserQuestionAnswers(chunk.id);
      const parsed = existingToolCall ? parseAskUserQuestionInput(existingToolCall.input) : null;

      // Use stored answers, or fall back to parsed from input
      const answers = storedAnswers || parsed?.answers;

      // Store answers back into input for session persistence
      if (existingToolCall && answers) {
        existingToolCall.input = { ...existingToolCall.input, answers };
      }

      if (askQuestionState && existingToolCall) {
        finalizeAskUserQuestionBlock(
          askQuestionState,
          answers,
          chunk.isError || isBlocked,
          parsed?.questions
        );
      }

      if (askQuestionState) {
        state.askUserQuestionStates.delete(chunk.id);
      }

      if (state.currentContentEl) {
        this.showThinkingIndicator(state.currentContentEl);
      }
      return;
    }

    // Regular tool result
    const isBlocked = isBlockedToolResult(chunk.content, chunk.isError);

    // Retroactive card: tool_result arrived without a prior tool_use (e.g. MCP direct calls).
    // Create the tool call card now so the result is at least visible.
    if (!existingToolCall && chunk.toolName && state.currentContentEl) {
      const toolCall: ToolCallInfo = {
        id: chunk.id,
        name: chunk.toolName,
        input: {},
        status: isBlocked ? 'blocked' : (chunk.isError ? 'error' : 'completed'),
        result: chunk.content,
        isExpanded: false,
      };
      msg.toolCalls = msg.toolCalls || [];
      msg.toolCalls.push(toolCall);
      msg.contentBlocks = msg.contentBlocks || [];
      msg.contentBlocks.push({ type: 'tool_use', toolId: chunk.id });
      renderToolCall(state.currentContentEl, toolCall, state.toolCallElements);
      updateToolCallResult(chunk.id, toolCall, state.toolCallElements);
    }

    if (existingToolCall) {
      existingToolCall.status = isBlocked ? 'blocked' : (chunk.isError ? 'error' : 'completed');
      existingToolCall.result = chunk.content;

      const writeEditState = state.writeEditStates.get(chunk.id);
      if (writeEditState && isWriteEditTool(existingToolCall.name)) {
        if (!chunk.isError && !isBlocked) {
          const diffData = plugin.agentService.getDiffData(chunk.id);
          if (diffData) {
            existingToolCall.diffData = diffData;
            updateWriteEditWithDiff(writeEditState, diffData);
          }
        }
        finalizeWriteEditBlock(writeEditState, chunk.isError || isBlocked);
      } else {
        updateToolCallResult(chunk.id, existingToolCall, state.toolCallElements);
      }
    }

    if (state.currentContentEl) {
      this.showThinkingIndicator(state.currentContentEl);
    }
  }

  // ============================================
  // Text Block Management
  // ============================================

  /** Appends text to the current text block. */
  async appendText(text: string): Promise<void> {
    const { state } = this.deps;
    if (!state.currentContentEl) return;

    if (!state.currentTextEl) {
      state.currentTextEl = state.currentContentEl.createDiv({ cls: 'ocop-text-block' });
      state.currentTextEl.addClass('ocop-text-block-streaming');
      state.currentTextContent = '';
    }

    state.currentTextContent += text;
    state.currentTextEl.textContent = state.currentTextContent;
  }

  /** Finalizes the current text block. */
  async finalizeCurrentTextBlock(msg?: ChatMessage): Promise<void> {
    const { state, renderer } = this.deps;
    const finalizedText = msg?.role === 'assistant'
      ? normalizeQuizMarkdown(state.currentTextContent)
      : state.currentTextContent;
    if (msg && finalizedText) {
      msg.contentBlocks = msg.contentBlocks || [];
      msg.contentBlocks.push({ type: 'text', content: finalizedText });
      if (msg.role === 'assistant') {
        msg.quizQuestion = parseQuizQuestionMeta(finalizedText);
        msg.socraticTurn = parseSocraticMeta(finalizedText);
      }
    }

    if (state.currentTextEl && finalizedText) {
      state.currentTextEl.removeClass('ocop-text-block-streaming');
      await renderer.renderContent(state.currentTextEl, finalizedText);
    }
    state.currentTextEl = null;
    state.currentTextContent = '';
  }

  // ============================================
  // Thinking Block Management
  // ============================================

  /** Appends thinking content. */
  async appendThinking(content: string, msg: ChatMessage): Promise<void> {
    const { state, renderer } = this.deps;
    if (!state.currentContentEl) return;

    this.hideThinkingIndicator();
    if (!state.currentThinkingState) {
      state.currentThinkingState = createThinkingBlock(
        state.currentContentEl,
        (el, md) => renderer.renderContent(el, md)
      );
    }

    await appendThinkingContent(state.currentThinkingState, content, (el, md) => renderer.renderContent(el, md));
  }

  /** Finalizes the current thinking block. */
  finalizeCurrentThinkingBlock(msg?: ChatMessage): void {
    const { state } = this.deps;
    if (!state.currentThinkingState) return;

    const durationSeconds = finalizeThinkingBlock(state.currentThinkingState);
    if (state.currentContentEl) {
      this.showThinkingIndicator(state.currentContentEl);
    }

    if (msg && state.currentThinkingState.content) {
      msg.contentBlocks = msg.contentBlocks || [];
      msg.contentBlocks.push({
        type: 'thinking',
        content: state.currentThinkingState.content,
        durationSeconds,
      });
    }

    state.currentThinkingState = null;
  }

  // ============================================
  // Sync Subagent Handling
  // ============================================

  /** Handles Task tool_use by creating a sync subagent block. */
  private async handleTaskToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage
  ): Promise<void> {
    const { state } = this.deps;
    if (!state.currentContentEl) return;

    const subagentState = createSubagentBlock(state.currentContentEl, chunk.id, chunk.input);
    state.activeSubagents.set(chunk.id, subagentState);

    msg.subagents = msg.subagents || [];
    msg.subagents.push(subagentState.info);

    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'subagent', subagentId: chunk.id });

    this.showThinkingIndicator(state.currentContentEl);
  }

  /** Routes chunks from subagents. */
  private async handleSubagentChunk(chunk: StreamChunk, msg: ChatMessage): Promise<void> {
    if (!('parentToolUseId' in chunk) || !chunk.parentToolUseId) {
      return;
    }
    const parentToolUseId = chunk.parentToolUseId;
    const { state } = this.deps;
    const subagentState = state.activeSubagents.get(parentToolUseId);

    if (!subagentState) {
      return;
    }

    switch (chunk.type) {
      case 'tool_use': {
        const toolCall: ToolCallInfo = {
          id: chunk.id,
          name: chunk.name,
          input: chunk.input,
          status: 'running',
          isExpanded: false,
        };
        addSubagentToolCall(subagentState, toolCall);
        if (state.currentContentEl) {
          this.showThinkingIndicator(state.currentContentEl);
        }
        break;
      }

      case 'tool_result': {
        const toolCall = subagentState.info.toolCalls.find(tc => tc.id === chunk.id);
        if (toolCall) {
          const isBlocked = isBlockedToolResult(chunk.content, chunk.isError);
          toolCall.status = isBlocked ? 'blocked' : (chunk.isError ? 'error' : 'completed');
          toolCall.result = chunk.content;
          updateSubagentToolResult(subagentState, chunk.id, toolCall);
        }
        break;
      }

      case 'text':
      case 'thinking':
        break;
    }
  }

  /** Finalizes a sync subagent when its Task tool_result is received. */
  private finalizeSubagent(
    chunk: { type: 'tool_result'; id: string; content: string; isError?: boolean },
    msg: ChatMessage,
    subagentState: SubagentState
  ): void {
    const { state } = this.deps;
    const isError = chunk.isError || false;
    finalizeSubagentBlock(subagentState, chunk.content, isError);

    const subagentInfo = msg.subagents?.find(s => s.id === chunk.id);
    if (subagentInfo) {
      subagentInfo.status = isError ? 'error' : 'completed';
      subagentInfo.result = chunk.content;
    }

    state.activeSubagents.delete(chunk.id);

    if (state.currentContentEl) {
      this.showThinkingIndicator(state.currentContentEl);
    }
  }

  // ============================================
  // Async Subagent Handling
  // ============================================

  /** Handles async Task tool_use (run_in_background=true). */
  private async handleAsyncTaskToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    msg: ChatMessage
  ): Promise<void> {
    const { state, asyncSubagentManager } = this.deps;
    if (!state.currentContentEl) return;

    const subagentInfo = asyncSubagentManager.createAsyncSubagent(chunk.id, chunk.input);

    const asyncState = createAsyncSubagentBlock(state.currentContentEl, chunk.id, chunk.input);
    state.asyncSubagentStates.set(chunk.id, asyncState);

    msg.subagents = msg.subagents || [];
    msg.subagents.push(subagentInfo);

    msg.contentBlocks = msg.contentBlocks || [];
    msg.contentBlocks.push({ type: 'subagent', subagentId: chunk.id, mode: 'async' });

    this.showThinkingIndicator(state.currentContentEl);
  }

  /** Handles AgentOutputTool tool_use (invisible, links to async subagent). */
  private handleAgentOutputToolUse(
    chunk: { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> },
    _msg: ChatMessage
  ): void {
    const toolCall: ToolCallInfo = {
      id: chunk.id,
      name: chunk.name,
      input: chunk.input,
      status: 'running',
      isExpanded: false,
    };

    this.deps.asyncSubagentManager.handleAgentOutputToolUse(toolCall);
  }

  /** Handles async Task tool_result to extract agent_id. */
  private handleAsyncTaskToolResult(
    chunk: { type: 'tool_result'; id: string; content: string; isError?: boolean },
    _msg: ChatMessage
  ): boolean {
    const { asyncSubagentManager } = this.deps;
    if (!asyncSubagentManager.isPendingAsyncTask(chunk.id)) {
      return false;
    }

    asyncSubagentManager.handleTaskToolResult(chunk.id, chunk.content, chunk.isError);
    return true;
  }

  /** Handles AgentOutputTool result to finalize async subagent. */
  private handleAgentOutputToolResult(
    chunk: { type: 'tool_result'; id: string; content: string; isError?: boolean },
    _msg: ChatMessage
  ): boolean {
    const { asyncSubagentManager } = this.deps;
    const isLinked = asyncSubagentManager.isLinkedAgentOutputTool(chunk.id);

    const handled = asyncSubagentManager.handleAgentOutputToolResult(
      chunk.id,
      chunk.content,
      chunk.isError || false
    );

    return isLinked || handled !== undefined;
  }

  /** Callback from AsyncSubagentManager when state changes. */
  onAsyncSubagentStateChange(subagent: SubagentInfo): void {
    const { state } = this.deps;
    let asyncState = state.asyncSubagentStates.get(subagent.id);

    if (!asyncState) {
      for (const s of state.asyncSubagentStates.values()) {
        if (s.info.agentId === subagent.agentId) {
          asyncState = s;
          break;
        }
      }
      if (!asyncState) return;
    }

    this.updateAsyncSubagentUI(asyncState, subagent);
  }

  /** Updates async subagent UI based on state. */
  private updateAsyncSubagentUI(
    asyncState: AsyncSubagentState,
    subagent: SubagentInfo
  ): void {
    asyncState.info = subagent;

    switch (subagent.asyncStatus) {
      case 'running':
        updateAsyncSubagentRunning(asyncState, subagent.agentId || '');
        break;

      case 'completed':
      case 'error':
        finalizeAsyncSubagent(asyncState, subagent.result || '', subagent.asyncStatus === 'error');
        break;

      case 'orphaned':
        markAsyncSubagentOrphaned(asyncState);
        break;
    }

    this.updateSubagentInMessages(subagent);
    this.queueScrollToBottom();
  }

  /** Updates subagent info in messages array. */
  private updateSubagentInMessages(subagent: SubagentInfo): void {
    const { state } = this.deps;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const msg = state.messages[i];
      if (msg.role === 'assistant' && msg.subagents) {
        const idx = msg.subagents.findIndex(s => s.id === subagent.id);
        if (idx !== -1) {
          msg.subagents[idx] = subagent;
          return;
        }
      }
    }
  }

  // ============================================
  // Thinking Indicator
  // ============================================

  /** Shows the thinking indicator. */
  showThinkingIndicator(parentEl: HTMLElement): void {
    const { state } = this.deps;

    if (state.thinkingEl) {
      // Re-append to ensure it's at the bottom
      parentEl.appendChild(state.thinkingEl);
      this.deps.updateQueueIndicator();
      return;
    }

    state.thinkingEl = parentEl.createDiv({ cls: 'ocop-thinking' });
    const dotsEl = state.thinkingEl.createSpan({ cls: 'ocop-thinking-dots' });
    dotsEl.createSpan({ cls: 'ocop-thinking-dot' });
    dotsEl.createSpan({ cls: 'ocop-thinking-dot' });
    dotsEl.createSpan({ cls: 'ocop-thinking-dot' });
    if (!this.deps.plugin.agentService.isCliReady()) {
      state.thinkingEl.createSpan({ text: ' Copilot 시작 중...', cls: 'ocop-thinking-startup' });
    }

    // Queue indicator line (initially hidden)
    state.queueIndicatorEl = state.thinkingEl.createDiv({ cls: 'ocop-queue-indicator' });
    this.deps.updateQueueIndicator();
  }

  /** Hides the thinking indicator. */
  hideThinkingIndicator(): void {
    const { state } = this.deps;
    if (state.thinkingEl) {
      state.thinkingEl.remove();
      state.thinkingEl = null;
    }
    state.queueIndicatorEl = null;
  }

  // ============================================
  // Utilities
  // ============================================

  /** Schedules a batched auto-scroll on the next animation frame. */
  private queueScrollToBottom(): void {
    if (this.pendingScrollFrameId !== null) {
      return;
    }

    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 16);

    this.pendingScrollFrameId = schedule(() => {
      this.pendingScrollFrameId = null;
      if (typeof this.deps.renderer.scrollToBottomIfNeeded === 'function') {
        this.deps.renderer.scrollToBottomIfNeeded();
      } else {
        const messagesEl = this.deps.getMessagesEl();
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }

  private cancelQueuedScroll(): void {
    if (this.pendingScrollFrameId !== null) {
      if (typeof cancelAnimationFrame === 'function' && typeof this.pendingScrollFrameId === 'number') {
        cancelAnimationFrame(this.pendingScrollFrameId);
      } else {
        clearTimeout(this.pendingScrollFrameId);
      }
      this.pendingScrollFrameId = null;
    }
  }

  /**
   * After stream finalization, scans the last text contentBlock for A)/B) choice patterns.
   * If ≥2 sequential options found, injects clickable choice buttons below the message content.
   */
  injectChoiceButtonsIfNeeded(
    contentEl: HTMLElement,
    msg: ChatMessage,
    onSelect: (choice: string) => void
  ): void {
    const lastTextBlock = [...(msg.contentBlocks ?? [])]
      .reverse()
      .find(b => b.type === 'text' && b.content);
    if (!lastTextBlock || lastTextBlock.type !== 'text' || !lastTextBlock.content) return;

    const options = this.parseChoiceOptions(lastTextBlock.content);
    if (!options) return;

    const panel = contentEl.createDiv({ cls: 'ocop-choice-buttons' });
    for (const opt of options) {
      const btn = panel.createEl('button', { cls: 'ocop-choice-btn' });
      btn.createSpan({ cls: 'ocop-choice-btn-label', text: opt.label + ')' });
      btn.createSpan({ cls: 'ocop-choice-btn-text', text: ' ' + opt.text });
      btn.addEventListener('click', () => {
        panel.remove();
        onSelect(opt.label);
      });
    }
  }

  /** Parses A)/B) option lines from text. Returns ≥2 sequential options or null. */
  private parseChoiceOptions(text: string): Array<{ label: string; text: string }> | null {
    const options: Array<{ label: string; text: string }> = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z])\)\s+(.+)$/);
      if (m) {
        options.push({ label: m[1], text: m[2].trim() });
      }
    }
    if (options.length < 2) return null;
    // Require sequential letters starting from A
    const expectedStart = 'A'.charCodeAt(0);
    if (options[0].label.charCodeAt(0) !== expectedStart) return null;
    for (let i = 1; i < options.length; i++) {
      if (options[i].label.charCodeAt(0) !== expectedStart + i) return null;
    }
    return options;
  }

  /** Resets streaming state after completion. */
  resetStreamingState(): void {
    const { state } = this.deps;
    this.cancelQueuedScroll();
    this.hideThinkingIndicator();
    state.currentContentEl = null;
    state.currentTextEl = null;
    state.currentTextContent = '';
    state.currentThinkingState = null;
    state.activeSubagents.clear();
  }
}

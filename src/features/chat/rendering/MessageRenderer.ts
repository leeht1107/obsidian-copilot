/**
 * Message rendering for chat view.
 *
 * Handles DOM creation and updates for chat messages, following the triadic
 * pattern (streaming render, update, stored render).
 */

import type { App, Component } from 'obsidian';
import { MarkdownRenderer, setIcon } from 'obsidian';

import { getImageAttachmentDataUri } from '../../../core/images/imageLoader';
import { isWriteEditTool, TOOL_ASK_USER_QUESTION, TOOL_TODO_WRITE } from '../../../core/tools/toolNames';
import type { ChatMessage, ImageAttachment, ToolCallInfo } from '../../../core/types';
import {
  renderStoredAskUserQuestion,
  renderStoredAsyncSubagent,
  renderStoredSubagent,
  renderStoredThinkingBlock,
  renderStoredToolCall,
  renderStoredWriteEdit,
} from '../../../ui';
import { processFileLinks, registerFileLinkHandler } from '../../../utils/fileLink';

/** Render content function type for callbacks. */
export type RenderContentFn = (el: HTMLElement, markdown: string) => Promise<void>;

const WELCOME_SUGGESTIONS = [
  'Summarize the current note and outline what matters.',
  'Plan a code or note change before editing anything.',
  'Compare attached files and call out the important differences.',
] as const;

/**
 * MessageRenderer handles all message DOM rendering.
 *
 * Separates rendering concerns from view lifecycle and stream handling.
 */
export class MessageRenderer {
  private app: App;
  private component: Component;
  private messagesEl: HTMLElement;

  constructor(
    app: App,
    component: Component,
    messagesEl: HTMLElement
  ) {
    this.app = app;
    this.component = component;
    this.messagesEl = messagesEl;

    // Register delegated click handler for file links
    registerFileLinkHandler(this.app, this.messagesEl, this.component);
  }

  /** Sets the messages container element. */
  setMessagesEl(el: HTMLElement): void {
    this.messagesEl = el;
  }

  // ============================================
  // Streaming Message Rendering
  // ============================================

  /**
   * Adds a new message to the chat during streaming.
   * Returns the message element for content updates.
   */
  addMessage(msg: ChatMessage): HTMLElement {
    // Skip hidden messages
    if (msg.hidden) {
      this.ensureTodoPanelAtBottom();
      this.scrollToBottom();
      const lastChild = this.messagesEl.lastElementChild as HTMLElement;
      return lastChild ?? this.messagesEl;
    }

    // Render approval indicator if present
    if (msg.approvalIndicator) {
      const indicatorEl = this.renderApprovalIndicator(msg.approvalIndicator);
      this.ensureTodoPanelAtBottom();
      this.scrollToBottom();
      return indicatorEl;
    }

    // Render images above message bubble for user messages
    if (msg.role === 'user' && msg.images && msg.images.length > 0) {
      this.renderMessageImages(this.messagesEl, msg.images);
    }

    // Skip empty bubble for image-only messages
    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (!textToShow) {
        this.ensureTodoPanelAtBottom();
        this.scrollToBottom();
        const lastChild = this.messagesEl.lastElementChild as HTMLElement;
        return lastChild ?? this.messagesEl;
      }
    }

    const msgEl = this.messagesEl.createDiv({
      cls: `ocop-message ocop-message-${msg.role}`,
    });

    const contentEl = msgEl.createDiv({ cls: 'ocop-message-content' });

    if (msg.role === 'assistant') {
      this.createCopyButton(msgEl, msg);
    }

    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (textToShow) {
        const textEl = contentEl.createDiv({ cls: 'ocop-text-block' });
        void this.renderContent(textEl, textToShow);
      }
    }

    this.ensureTodoPanelAtBottom();
    this.scrollToBottom();
    return msgEl;
  }

  // ============================================
  // Stored Message Rendering (Batch/Replay)
  // ============================================

  /**
   * Renders all messages for conversation load/switch.
   * @param messages Array of messages to render
   * @param getGreeting Function to get greeting text
   * @returns The newly created welcome element
   */
  renderMessages(
    messages: ChatMessage[],
    getGreeting: () => string
  ): HTMLElement {
    const existingTodoPanel = this.messagesEl.querySelector('.ocop-todo-panel') as HTMLElement | null;
    this.messagesEl.empty();

    const newWelcomeEl = this.createWelcomeElement(getGreeting());

    for (const msg of messages) {
      this.renderStoredMessage(msg);
    }

    this.ensureTodoPanelAtBottom(existingTodoPanel);
    this.scrollToBottom();
    return newWelcomeEl;
  }

  createWelcomeElement(greeting: string): HTMLElement {
    const welcomeEl = this.messagesEl.createDiv({ cls: 'ocop-welcome' });
    welcomeEl.createDiv({ cls: 'ocop-welcome-greeting', text: greeting });
    welcomeEl.createDiv({
      cls: 'ocop-welcome-subtitle',
      text: 'Your vault-aware pair programmer for note analysis, planning, and implementation work.',
    });

    const suggestionsEl = welcomeEl.createDiv({ cls: 'ocop-welcome-suggestions' });
    for (const prompt of WELCOME_SUGGESTIONS) {
      const button = suggestionsEl.createEl('button', {
        cls: 'ocop-welcome-suggestion',
        text: prompt,
      });
      button.type = 'button';
    }

    return welcomeEl;
  }

  /**
   * Renders a persisted message from history.
   */
  renderStoredMessage(msg: ChatMessage): void {
    // Skip hidden messages
    if (msg.hidden) {
      return;
    }

    // Render approval indicator if present
    if (msg.approvalIndicator) {
      this.renderApprovalIndicator(msg.approvalIndicator);
      return;
    }

    // Render images above bubble for user messages
    if (msg.role === 'user' && msg.images && msg.images.length > 0) {
      this.renderMessageImages(this.messagesEl, msg.images);
    }

    // Skip empty bubble for image-only messages
    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (!textToShow) {
        return;
      }
    }

    const msgEl = this.messagesEl.createDiv({
      cls: `ocop-message ocop-message-${msg.role}`,
    });

    // Apply plan message styling if this is a plan message
    if (msg.isPlanMessage) {
      msgEl.classList.add('ocop-message-plan');
    }

    const contentEl = msgEl.createDiv({ cls: 'ocop-message-content' });

    if (msg.role === 'assistant') {
      this.createCopyButton(msgEl, msg);
    }

    if (msg.role === 'user') {
      const textToShow = msg.displayContent ?? msg.content;
      if (textToShow) {
        const textEl = contentEl.createDiv({ cls: 'ocop-text-block' });
        void this.renderContent(textEl, textToShow);
      }
    } else if (msg.role === 'assistant') {
      this.renderAssistantContent(msg, contentEl);
    }
  }

  /**
   * Renders an approval indicator for plan mode decisions.
   */
  private renderApprovalIndicator(indicator: NonNullable<ChatMessage['approvalIndicator']>): HTMLElement {
    const indicatorEl = this.messagesEl.createDiv({
      cls: 'ocop-approval-indicator',
    });

    const iconEl = indicatorEl.createSpan({ cls: 'ocop-approval-indicator-icon' });
    const textEl = indicatorEl.createSpan({ cls: 'ocop-approval-indicator-text' });

    switch (indicator.type) {
      case 'approve':
        indicatorEl.classList.add('ocop-approval-indicator-approve');
        setIcon(iconEl, 'check');
        textEl.textContent = 'User approved plan.';
        break;
      case 'approve_new_session':
        indicatorEl.classList.add('ocop-approval-indicator-approve');
        setIcon(iconEl, 'check');
        textEl.textContent = 'User approved plan, implement in new session.';
        break;
      case 'revise':
        indicatorEl.classList.add('ocop-approval-indicator-revise');
        setIcon(iconEl, 'x');
        textEl.textContent = indicator.feedback || 'User requested revision.';
        break;
    }

    return indicatorEl;
  }

  /**
   * Renders assistant message content (content blocks or fallback).
   */
  private renderAssistantContent(msg: ChatMessage, contentEl: HTMLElement): void {
    if (msg.contentBlocks && msg.contentBlocks.length > 0) {
      for (const block of msg.contentBlocks) {
        if (block.type === 'thinking') {
          renderStoredThinkingBlock(
            contentEl,
            block.content,
            block.durationSeconds,
            (el, md) => this.renderContent(el, md)
          );
        } else if (block.type === 'text') {
          const textEl = contentEl.createDiv({ cls: 'ocop-text-block' });
          void this.renderContent(textEl, block.content);
        } else if (block.type === 'tool_use') {
          const toolCall = msg.toolCalls?.find(tc => tc.id === block.toolId);
          if (toolCall) {
            this.renderToolCall(contentEl, toolCall);
          }
        } else if (block.type === 'subagent') {
          const subagent = msg.subagents?.find(s => s.id === block.subagentId);
          if (subagent) {
            const mode = block.mode || subagent.mode || 'sync';
            if (mode === 'async') {
              renderStoredAsyncSubagent(contentEl, subagent);
            } else {
              renderStoredSubagent(contentEl, subagent);
            }
          }
        }
      }
    } else {
      // Fallback for old conversations without contentBlocks
      if (msg.content) {
        const textEl = contentEl.createDiv({ cls: 'ocop-text-block' });
        void this.renderContent(textEl, msg.content);
      }
      if (msg.toolCalls) {
        for (const toolCall of msg.toolCalls) {
          this.renderToolCall(contentEl, toolCall);
        }
      }
    }

    if (msg.quizQuestion) {
      this.renderQuizAnswerActions(contentEl, msg.quizQuestion);
    }
  }

  private renderQuizAnswerActions(contentEl: HTMLElement, quizQuestion: NonNullable<ChatMessage['quizQuestion']>): void {
    // Progress bar
    const progressWrapper = contentEl.createDiv({ cls: 'ocop-quiz-progress-wrapper' });
    const progressEl = progressWrapper.createDiv({ cls: 'ocop-quiz-progress' });
    const fillPct = Math.round((quizQuestion.current / quizQuestion.total) * 100);
    progressEl.createDiv({ cls: 'ocop-quiz-progress-fill', attr: { style: `width: ${fillPct}%` } });
    progressWrapper.createSpan({ cls: 'ocop-quiz-progress-label', text: `${quizQuestion.current} / ${quizQuestion.total}번` });

    const actionsEl = contentEl.createDiv({ cls: 'ocop-quiz-actions' });

    // Free-text questions: show input field in stored messages
    if (quizQuestion.freeText) {
      const input = actionsEl.createEl('input', {
        cls: 'ocop-quiz-answer-freetext-input',
        attr: { type: 'text', placeholder: '답변을 입력하세요', 'data-freetext-input': 'true' },
      });
      const submitBtn = actionsEl.createEl('button', {
        cls: 'ocop-quiz-submit-btn',
        text: '제출',
        attr: { 'data-answer-submit': 'true' },
      });
      submitBtn.type = 'button';
      submitBtn.addEventListener('click', () => {
        const value = input.value.trim();
        if (value) {
          submitBtn.setAttribute('data-answer-value', value);
        }
      });
      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = input.value.trim();
          if (value) {
            submitBtn.setAttribute('data-answer-value', value);
            submitBtn.click();
          }
        }
      });
      return;
    }

    const selected = new Set<string>();
    let submitBtn: HTMLButtonElement | null = null;

    if (quizQuestion.multiSelect) {
      submitBtn = actionsEl.createEl('button', {
        cls: 'ocop-quiz-submit-btn',
        text: '선택 제출',
        attr: { 'data-answer-submit': 'true' },
      });
      submitBtn.type = 'button';
      submitBtn.disabled = true;
      submitBtn.addEventListener('click', () => {
        submitBtn?.setAttribute('data-answer-value', Array.from(selected).sort().join(','));
      });
    }

    for (const option of quizQuestion.options) {
      const button = actionsEl.createEl('button', {
        cls: 'ocop-quiz-answer-btn',
        text: `${option.label}. ${option.text}`,
        attr: {
          'data-answer-label': option.label,
          'data-answer-text': option.text,
          'data-multi-select': quizQuestion.multiSelect ? 'true' : 'false',
        },
      });
      button.type = 'button';
      if (quizQuestion.multiSelect) {
        button.addEventListener('click', () => {
          if (selected.has(option.label)) {
            selected.delete(option.label);
            button.removeClass('is-selected');
          } else {
            selected.add(option.label);
            button.addClass('is-selected');
          }
          if (submitBtn) {
            submitBtn.disabled = selected.size === 0;
          }
        });
      }
    }
  }

  /**
   * Renders a tool call with special handling for Write/Edit, and AskUserQuestion.
   * TodoWrite is not rendered inline - it only shows in the bottom panel.
   */
  private renderToolCall(contentEl: HTMLElement, toolCall: ToolCallInfo): void {
    if (toolCall.name === TOOL_TODO_WRITE) {
      // TodoWrite is not rendered inline - only in bottom panel
      return;
    } else if (toolCall.name === TOOL_ASK_USER_QUESTION) {
      renderStoredAskUserQuestion(contentEl, toolCall);
    } else if (isWriteEditTool(toolCall.name)) {
      renderStoredWriteEdit(contentEl, toolCall);
    } else {
      renderStoredToolCall(contentEl, toolCall);
    }
  }

  // ============================================
  // Image Rendering
  // ============================================

  /**
   * Renders image attachments above a message.
   */
  renderMessageImages(containerEl: HTMLElement, images: ImageAttachment[]): void {
    const imagesEl = containerEl.createDiv({ cls: 'ocop-message-images' });

    for (const image of images) {
      const imageWrapper = imagesEl.createDiv({ cls: 'ocop-message-image' });
      const imgEl = imageWrapper.createEl('img', {
        attr: {
          alt: image.name,
        },
      });

      void this.setImageSrc(imgEl, image);

      // Click to view full size
      imgEl.addEventListener('click', () => {
        void this.showFullImage(image);
      });
    }
  }

  /**
   * Shows full-size image in modal overlay.
   */
  async showFullImage(image: ImageAttachment): Promise<void> {
    const dataUri = getImageAttachmentDataUri(this.app, image);
    if (!dataUri) return;

    const overlay = document.body.createDiv({ cls: 'ocop-image-modal-overlay' });
    const modal = overlay.createDiv({ cls: 'ocop-image-modal' });

    modal.createEl('img', {
      attr: {
        src: dataUri,
        alt: image.name,
      },
    });

    const closeBtn = modal.createDiv({ cls: 'ocop-image-modal-close' });
    closeBtn.setText('\u00D7');

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    const close = () => {
      document.removeEventListener('keydown', handleEsc);
      overlay.remove();
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', handleEsc);
  }

  /**
   * Sets image src from attachment data.
   */
  async setImageSrc(imgEl: HTMLImageElement, image: ImageAttachment): Promise<void> {
    const dataUri = getImageAttachmentDataUri(this.app, image);
    if (dataUri) {
      imgEl.setAttribute('src', dataUri);
    } else {
      imgEl.setAttribute('alt', `${image.name} (missing)`);
    }
  }

  // ============================================
  // Content Rendering
  // ============================================

  /**
   * Renders markdown content with code block enhancements.
   */
  async renderContent(el: HTMLElement, markdown: string): Promise<void> {
    el.empty();
    await MarkdownRenderer.renderMarkdown(markdown, el, '', this.component);

    // Wrap pre elements and move buttons outside scroll area
    el.querySelectorAll('pre').forEach((pre) => {
      // Skip if already wrapped
      if (pre.parentElement?.classList.contains('ocop-code-wrapper')) return;

      // Create wrapper
      const wrapper = createEl('div', { cls: 'ocop-code-wrapper' });
      pre.parentElement?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      // Check for language class and add label
      const code = pre.querySelector('code[class*="language-"]');
      if (code) {
        const match = code.className.match(/language-(\w+)/);
        if (match) {
          wrapper.classList.add('has-language');
          const label = createEl('span', {
            cls: 'ocop-code-lang-label',
            text: match[1],
          });
          wrapper.appendChild(label);
          label.addEventListener('click', async () => {
            await navigator.clipboard.writeText(code.textContent || '');
            label.setText('copied!');
            setTimeout(() => label.setText(match[1]), 1500);
          });
        }
      }

      // Move Obsidian's copy button outside pre into wrapper
      const copyBtn = pre.querySelector('.copy-code-button');
      if (copyBtn) {
        wrapper.appendChild(copyBtn);
      }
    });

    // Process file paths to make them clickable links
    processFileLinks(this.app, el);
  }

  // ============================================
  // Utilities
  // ============================================

  /** Creates a copy button for assistant messages. */
  private createCopyButton(msgEl: HTMLElement, msg: ChatMessage): void {
    const btn = msgEl.createEl('button', {
      cls: 'ocop-msg-copy-btn',
      attr: { 'aria-label': 'Copy message', type: 'button' },
    });
    setIcon(btn, 'copy');
    btn.addEventListener('click', () => {
      void navigator.clipboard.writeText(msg.content).then(() => {
        setIcon(btn, 'check');
        btn.classList.add('is-copied');
        setTimeout(() => {
          setIcon(btn, 'copy');
          btn.classList.remove('is-copied');
        }, 1500);
      });
    });
  }

  /** Scrolls messages container to bottom. */
  scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Scrolls to bottom if already near bottom (within threshold). */
  scrollToBottomIfNeeded(threshold = 100): void {
    const { scrollTop, scrollHeight, clientHeight } = this.messagesEl;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      });
    }
  }

  /** Keeps the persistent todo panel pinned to the bottom of the messages container. */
  private ensureTodoPanelAtBottom(panelEl?: HTMLElement | null): void {
    const todoPanel = panelEl ?? (this.messagesEl.querySelector('.ocop-todo-panel') as HTMLElement | null);
    if (todoPanel) {
      this.messagesEl.appendChild(todoPanel);
    }
  }
}

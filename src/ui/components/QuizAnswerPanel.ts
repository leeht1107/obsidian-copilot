/**
 * QuizAnswerPanel component.
 *
 * Replaces the input area with a keyboard-navigable answer selection panel.
 * Follows PlanApprovalPanel pattern: hides input wrapper, shows panel, restores on resolve.
 */

import type { QuizQuestionMeta } from '../../core/types';

const QUIZ_PANEL_DISMISS_KEY = '__ocopDismissQuizAnswerPanel__';

type QuizAnswerPanelElement = HTMLElement & {
  [QUIZ_PANEL_DISMISS_KEY]?: () => void;
};

/** Options for creating the quiz answer panel. */
export interface QuizAnswerPanelOptions {
  containerEl: HTMLElement;
  quizQuestion: QuizQuestionMeta;
  onAnswer: (answer: string) => void;
  onCancel: () => void;
}

/** Find the input container and wrapper elements. */
function findInputElements(containerEl: HTMLElement): {
  inputContainer: HTMLElement | null;
  inputWrapper: HTMLElement | null;
} {
  const inputContainer = containerEl.querySelector('.ocop-input-container') as HTMLElement | null;
  const inputWrapper = containerEl.querySelector('.ocop-input-wrapper') as HTMLElement | null;
  return { inputContainer, inputWrapper };
}

/**
 * QuizAnswerPanel — shows option rows with keyboard navigation.
 */
export class QuizAnswerPanel {
  private panelEl: HTMLElement;
  private onAnswer: (answer: string) => void;
  private onCancel: () => void;
  private isDestroyed = false;
  private currentOptionIndex = 0;
  private optionsEl: HTMLElement | null = null;
  private quizQuestion: QuizQuestionMeta;
  private selected = new Set<string>();

  // Input area references
  private inputWrapper: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;

  constructor(options: QuizAnswerPanelOptions) {
    this.quizQuestion = options.quizQuestion;
    this.onAnswer = options.onAnswer;
    this.onCancel = options.onCancel;

    const { inputContainer, inputWrapper } = findInputElements(options.containerEl);
    this.inputContainer = inputContainer;
    this.inputWrapper = inputWrapper;

    if (this.inputWrapper) {
      this.inputWrapper.style.display = 'none';
    }

    this.panelEl = this.createPanel();
    (this.panelEl as QuizAnswerPanelElement)[QUIZ_PANEL_DISMISS_KEY] = () => this.handleCancel();
    if (this.inputContainer) {
      this.inputContainer.appendChild(this.panelEl);
    } else {
      options.containerEl.appendChild(this.panelEl);
    }

    this.panelEl.focus();
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'ocop-quiz-answer-panel';
    panel.setAttribute('tabindex', '0');
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Quiz answer selection');

    panel.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Header: progress bar
    const headerEl = document.createElement('div');
    headerEl.className = 'ocop-quiz-answer-header';

    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'ocop-quiz-progress-wrapper';

    const progressEl = document.createElement('div');
    progressEl.className = 'ocop-quiz-progress';
    const fillPct = Math.round((this.quizQuestion.current / this.quizQuestion.total) * 100);
    const fillEl = document.createElement('div');
    fillEl.className = 'ocop-quiz-progress-fill';
    fillEl.style.width = `${fillPct}%`;
    progressEl.appendChild(fillEl);
    progressWrapper.appendChild(progressEl);

    const labelEl = document.createElement('span');
    labelEl.className = 'ocop-quiz-progress-label';
    labelEl.textContent = `${this.quizQuestion.current} / ${this.quizQuestion.total}번`;
    progressWrapper.appendChild(labelEl);

    headerEl.appendChild(progressWrapper);
    panel.appendChild(headerEl);

    if (this.quizQuestion.freeText) {
      this.renderFreeTextInput(panel);
    } else {
      // Options
      this.optionsEl = document.createElement('div');
      this.optionsEl.className = 'ocop-quiz-answer-options';
      this.renderOptions();
      panel.appendChild(this.optionsEl);
    }

    return panel;
  }

  private renderFreeTextInput(panel: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'ocop-quiz-answer-freetext';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ocop-quiz-answer-freetext-input';
    input.placeholder = '답변을 입력하세요';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const value = input.value.trim();
        if (value) {
          this.submitAnswer(value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.handleCancel();
      }
    });
    wrapper.appendChild(input);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'ocop-quiz-answer-submit-btn';
    submitBtn.textContent = '제출 (Enter)';
    submitBtn.addEventListener('click', () => {
      const value = input.value.trim();
      if (value) {
        this.submitAnswer(value);
      }
    });
    wrapper.appendChild(submitBtn);

    panel.appendChild(wrapper);

    // Focus the input instead of the panel
    setTimeout(() => input.focus(), 50);
  }

  private renderOptions(): void {
    if (!this.optionsEl) return;
    this.optionsEl.innerHTML = '';

    const { options, multiSelect } = this.quizQuestion;

    options.forEach((option, index) => {
      const optionEl = document.createElement('div');
      optionEl.className = 'ocop-quiz-answer-option';
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('data-option-index', String(index));

      // Caret indicator
      const caretEl = document.createElement('span');
      caretEl.className = 'ocop-quiz-answer-caret';
      caretEl.textContent = index === this.currentOptionIndex ? '>' : ' ';
      optionEl.appendChild(caretEl);

      // Checkbox for multi-select
      if (multiSelect) {
        const checkEl = document.createElement('span');
        checkEl.className = 'ocop-quiz-answer-check';
        checkEl.textContent = this.selected.has(option.label) ? '[x]' : '[ ]';
        optionEl.appendChild(checkEl);
      }

      // Label + text
      const labelEl = document.createElement('span');
      labelEl.className = 'ocop-quiz-answer-label';
      labelEl.textContent = `${option.label}. ${option.text}`;
      optionEl.appendChild(labelEl);

      // Click handler
      optionEl.addEventListener('click', () => {
        this.currentOptionIndex = index;
        this.updateOptionFocus();
        if (multiSelect) {
          this.toggleOption(option.label);
        } else {
          this.submitAnswer(option.label);
        }
      });

      // Hover
      optionEl.addEventListener('mouseenter', () => {
        this.currentOptionIndex = index;
        this.updateOptionFocus();
      });

      if (index === this.currentOptionIndex) {
        optionEl.classList.add('focused');
      }

      this.optionsEl!.appendChild(optionEl);
    });

    // Submit button for multi-select
    if (multiSelect) {
      const submitEl = document.createElement('div');
      submitEl.className = 'ocop-quiz-answer-submit';

      const submitBtn = document.createElement('button');
      submitBtn.className = 'ocop-quiz-answer-submit-btn';
      submitBtn.textContent = '선택 제출 (Enter)';
      submitBtn.disabled = this.selected.size === 0;
      submitBtn.addEventListener('click', () => this.submitMultiAnswer());
      submitEl.appendChild(submitBtn);

      this.optionsEl.appendChild(submitEl);
    }
  }

  private updateOptionFocus(): void {
    if (!this.optionsEl) return;

    const options = this.optionsEl.querySelectorAll('.ocop-quiz-answer-option');
    options.forEach((opt, i) => {
      const caret = opt.querySelector('.ocop-quiz-answer-caret');
      const isFocused = i === this.currentOptionIndex;
      opt.classList.toggle('focused', isFocused);
      if (caret) {
        caret.textContent = isFocused ? '>' : ' ';
      }
    });
  }

  private toggleOption(label: string): void {
    if (this.selected.has(label)) {
      this.selected.delete(label);
    } else {
      this.selected.add(label);
    }
    this.renderOptions();
    this.updateOptionFocus();
  }

  private submitAnswer(label: string): void {
    if (this.isDestroyed) return;
    this.destroy();
    this.onAnswer(label);
  }

  private submitMultiAnswer(): void {
    if (this.isDestroyed || this.selected.size === 0) return;
    this.destroy();
    this.onAnswer(Array.from(this.selected).sort().join(','));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isDestroyed) return;

    const { options, multiSelect } = this.quizQuestion;
    const maxIndex = options.length - 1;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.currentOptionIndex = Math.max(0, this.currentOptionIndex - 1);
        this.updateOptionFocus();
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.currentOptionIndex = Math.min(maxIndex, this.currentOptionIndex + 1);
        this.updateOptionFocus();
        break;

      case 'Enter':
        e.preventDefault();
        if (multiSelect) {
          this.submitMultiAnswer();
        } else {
          this.submitAnswer(options[this.currentOptionIndex].label);
        }
        break;

      case ' ':
        if (multiSelect) {
          e.preventDefault();
          this.toggleOption(options[this.currentOptionIndex].label);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.handleCancel();
        break;

      default: {
        // A/B/C/D or 1/2/3/4 shortcuts
        const upper = e.key.toUpperCase();
        const byLabel = options.findIndex((o) => o.label.toUpperCase() === upper);
        if (byLabel >= 0) {
          e.preventDefault();
          this.currentOptionIndex = byLabel;
          this.updateOptionFocus();
          if (!multiSelect) {
            this.submitAnswer(options[byLabel].label);
          } else {
            this.toggleOption(options[byLabel].label);
          }
          break;
        }
        const byNumber = parseInt(e.key, 10);
        if (byNumber >= 1 && byNumber <= options.length) {
          e.preventDefault();
          const idx = byNumber - 1;
          this.currentOptionIndex = idx;
          this.updateOptionFocus();
          if (!multiSelect) {
            this.submitAnswer(options[idx].label);
          } else {
            this.toggleOption(options[idx].label);
          }
        }
        break;
      }
    }
  }

  private handleCancel(): void {
    if (this.isDestroyed) return;
    this.destroy();
    this.onCancel();
  }

  private destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    delete (this.panelEl as QuizAnswerPanelElement)[QUIZ_PANEL_DISMISS_KEY];
    this.panelEl.remove();
    if (this.inputWrapper) {
      this.inputWrapper.style.display = '';
    }
  }
}

/**
 * Show the quiz answer panel.
 * Returns a promise that resolves with the answer or cancellation.
 */
export function showQuizAnswerPanel(
  containerEl: HTMLElement,
  quizQuestion: QuizQuestionMeta
): Promise<{ answer: string } | { cancelled: true }> {
  return new Promise((resolve) => {
    new QuizAnswerPanel({
      containerEl,
      quizQuestion,
      onAnswer: (answer) => resolve({ answer }),
      onCancel: () => resolve({ cancelled: true }),
    });
  });
}

/** Dismisses the active quiz answer panel and restores the input wrapper. */
export function dismissQuizAnswerPanel(containerEl: HTMLElement): boolean {
  const panelEl = containerEl.querySelector('.ocop-quiz-answer-panel') as QuizAnswerPanelElement | null;
  if (!panelEl) {
    return false;
  }

  const dismiss = panelEl[QUIZ_PANEL_DISMISS_KEY];
  if (typeof dismiss === 'function') {
    dismiss();
    return true;
  }

  panelEl.remove();
  const inputWrapper = containerEl.querySelector('.ocop-input-wrapper') as HTMLElement | null;
  if (inputWrapper) {
    inputWrapper.style.display = '';
  }
  return true;
}

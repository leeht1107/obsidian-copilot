import type { QuizQuestionMeta } from '@/core/types';
import { dismissQuizAnswerPanel,QuizAnswerPanel } from '@/ui/components/QuizAnswerPanel';

type Listener = (event: any) => void;

class MockClassList {
  private classes = new Set<string>();

  add(...items: string[]): void {
    items.forEach((item) => this.classes.add(item));
  }

  remove(...items: string[]): void {
    items.forEach((item) => this.classes.delete(item));
  }

  contains(item: string): boolean {
    return this.classes.has(item);
  }

  has(item: string): boolean {
    return this.classes.has(item);
  }

  clear(): void {
    this.classes.clear();
  }

  toArray(): string[] {
    return Array.from(this.classes);
  }
}

class MockElement {
  tagName: string;
  classList = new MockClassList();
  style: Record<string, string> = {};
  children: MockElement[] = [];
  attributes: Record<string, string> = {};
  parent: MockElement | null = null;
  textContent = '';
  private listeners: Record<string, Listener[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  set className(value: string) {
    this.classList.clear();
    value.split(/\s+/).filter(Boolean).forEach((cls) => this.classList.add(cls));
  }

  get className(): string {
    return this.classList.toArray().join(' ');
  }

  set innerHTML(_value: string) {
    this.children = [];
    this.textContent = '';
  }

  appendChild(child: MockElement): MockElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  dispatchEvent(event: any): void {
    const listeners = this.listeners[event.type] || [];
    for (const listener of listeners) {
      listener(event);
    }
    if (event.bubbles && this.parent) {
      this.parent.dispatchEvent(event);
    }
  }

  focus(): void {
    const doc = (global as any).document;
    doc.activeElement = this;
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const matches: MockElement[] = [];
    const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
    const walk = (el: MockElement) => {
      if (!classMatch || el.classList.has(classMatch[1])) {
        matches.push(el);
      }
      for (const child of el.children) {
        walk(child);
      }
    };
    for (const child of this.children) {
      walk(child);
    }
    return matches;
  }
}

function createMockDocument() {
  const body = new MockElement('body');
  return {
    body,
    activeElement: null as MockElement | null,
    createElement: (tag: string) => new MockElement(tag),
  };
}

function createQuizContainer(document: ReturnType<typeof createMockDocument>) {
  const container = document.createElement('div');
  const inputContainer = document.createElement('div');
  inputContainer.className = 'ocop-input-container';
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'ocop-input-wrapper';
  inputContainer.appendChild(inputWrapper);
  container.appendChild(inputContainer);
  document.body.appendChild(container);
  return { container, inputWrapper };
}

function createQuizQuestion(overrides: Partial<QuizQuestionMeta> = {}): QuizQuestionMeta {
  return {
    current: 1,
    total: 5,
    multiSelect: false,
    freeText: false,
    options: [
      { label: 'A', text: 'Option A' },
      { label: 'B', text: 'Option B' },
    ],
    ...overrides,
  };
}

describe('QuizAnswerPanel', () => {
  it('dismisses the active panel through the exported helper and restores the input wrapper', () => {
    const originalDocument = (global as any).document;
    const mockDocument = createMockDocument();
    (global as any).document = mockDocument;
    const { container, inputWrapper } = createQuizContainer(mockDocument);
    const onCancel = jest.fn();

    new QuizAnswerPanel({
      containerEl: container as unknown as HTMLElement,
      quizQuestion: createQuizQuestion(),
      onAnswer: jest.fn(),
      onCancel,
    });

    expect(inputWrapper.style.display).toBe('none');
    expect(container.querySelector('.ocop-quiz-answer-panel')).not.toBeNull();

    expect(dismissQuizAnswerPanel(container as unknown as HTMLElement)).toBe(true);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.ocop-quiz-answer-panel')).toBeNull();
    expect(inputWrapper.style.display).toBe('');
    (global as any).document = originalDocument;
  });

  it('falls back cleanly when no active quiz panel exists', () => {
    const originalDocument = (global as any).document;
    const mockDocument = createMockDocument();
    (global as any).document = mockDocument;
    const { container, inputWrapper } = createQuizContainer(mockDocument);
    inputWrapper.style.display = 'none';

    expect(dismissQuizAnswerPanel(container as unknown as HTMLElement)).toBe(false);
    expect(inputWrapper.style.display).toBe('none');
    (global as any).document = originalDocument;
  });
});

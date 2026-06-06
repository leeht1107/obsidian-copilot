/**
 * Tests for StreamController - Stream Chunk Handling
 *
 * Note: These tests focus on the controller logic for text content handling.
 * Tool result tracking and UI rendering are tested through integration tests.
 */

import { TOOL_ASK_USER_QUESTION, TOOL_TASK, TOOL_TODO_WRITE } from '@/core/tools/toolNames';
import type { ChatMessage } from '@/core/types';
import { StreamController, type StreamControllerDeps } from '@/features/chat/controllers/StreamController';
import { ChatState } from '@/features/chat/state/ChatState';

// Mock UI module
jest.mock('@/ui', () => {
  const mockWrapperEl = {
    addClass: jest.fn(),
    removeClass: jest.fn(),
  };
  return {
    createSubagentBlock: jest.fn().mockReturnValue({
      info: { id: 'task-1', description: 'test', status: 'running', toolCalls: [] },
    }),
    createAskUserQuestionBlock: jest.fn().mockReturnValue({
      wrapperEl: mockWrapperEl,
      headerEl: {},
      answerEl: {},
      questions: [],
    }),
    parseAskUserQuestionInput: jest.fn().mockReturnValue({
      questions: [],
    }),
    finalizeAskUserQuestionBlock: jest.fn(),
    createThinkingBlock: jest.fn().mockReturnValue({
      container: {},
      contentEl: {},
      content: '',
      startTime: Date.now(),
    }),
    appendThinkingContent: jest.fn(),
    finalizeThinkingBlock: jest.fn().mockReturnValue(0),
    renderToolCall: jest.fn(),
    updateToolCallResult: jest.fn(),
    isBlockedToolResult: jest.fn().mockReturnValue(false),
    parseTodoInput: jest.fn(),
  };
});

// Helper to create mock DOM element with full properties needed for rendering
function createMockElement() {
  const children: any[] = [];
  const classList = new Set<string>();
  const dataset: Record<string, string> = {};
  const attributes: Record<string, string> = {};

  const element: any = {
    children,
    classList: {
      add: (cls: string) => classList.add(cls),
      remove: (cls: string) => classList.delete(cls),
      contains: (cls: string) => classList.has(cls),
    },
    addClass: (cls: string) => classList.add(cls),
    removeClass: (cls: string) => classList.delete(cls),
    hasClass: (cls: string) => classList.has(cls),
    style: { display: '' },
    scrollTop: 0,
    scrollHeight: 0,
    dataset,
    empty: () => { children.length = 0; },
    createDiv: (opts?: { cls?: string; text?: string }) => {
      const child = createMockElement();
      if (opts?.cls) child.addClass(opts.cls);
      if (opts?.text) child.textContent = opts.text;
      children.push(child);
      return child;
    },
    createSpan: (opts?: { cls?: string; text?: string }) => {
      const child = createMockElement();
      if (opts?.cls) child.addClass(opts.cls);
      if (opts?.text) child.textContent = opts.text;
      children.push(child);
      return child;
    },
    createEl: (tag: string, opts?: { cls?: string; text?: string }) => {
      const child = createMockElement();
      child.tagName = tag.toUpperCase();
      if (opts?.cls) child.addClass(opts.cls);
      if (opts?.text) child.textContent = opts.text;
      children.push(child);
      return child;
    },
    appendChild: (child: any) => { children.push(child); return child; },
    querySelector: jest.fn().mockReturnValue(null),
    querySelectorAll: jest.fn().mockReturnValue([]),
    remove: jest.fn(),
    setText: jest.fn((text: string) => { element.textContent = text; }),
    setAttr: jest.fn(),
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    getAttribute: (name: string) => attributes[name],
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    textContent: '',
    tagName: 'DIV',
  };

  return element;
}

// Helper to create mock dependencies with minimal UI rendering
function createMockDeps(): StreamControllerDeps {
  const state = new ChatState();
  const messagesEl = createMockElement();
  const agentService = {
    getAskUserQuestionAnswers: jest.fn().mockReturnValue(undefined),
    getDiffData: jest.fn().mockReturnValue(undefined),
    getSessionId: jest.fn().mockReturnValue('session-1'),
    isAskUserQuestionToolSupported: jest.fn().mockReturnValue(true),
    isCliReady: jest.fn().mockReturnValue(true),
  };
  const fileContextManager = {
    markFileBeingEdited: jest.fn(),
    trackEditedFile: jest.fn(),
    getAttachedFiles: jest.fn().mockReturnValue(new Set()),
    hasFilesChanged: jest.fn().mockReturnValue(false),
  };

  return {
    plugin: {
      settings: {
        permissionMode: 'yolo',
      },
      app: {
        vault: {
          adapter: {
            basePath: '/test/vault',
          },
        },
      },
      agentService,
    } as any,
    state,
    renderer: {
      renderContent: jest.fn(),
    } as any,
    asyncSubagentManager: {
      isAsyncTask: jest.fn().mockReturnValue(false),
      isPendingAsyncTask: jest.fn().mockReturnValue(false),
      isLinkedAgentOutputTool: jest.fn().mockReturnValue(false),
      handleAgentOutputToolResult: jest.fn().mockReturnValue(undefined),
      registerTask: jest.fn(),
      updateTaskRunning: jest.fn(),
      completeTask: jest.fn(),
      failTask: jest.fn(),
    } as any,
    getMessagesEl: () => messagesEl,
    getFileContextManager: () => fileContextManager as any,
    updateQueueIndicator: jest.fn(),
    setPlanModeActive: jest.fn(),
  };
}

// Helper to create a test message
function createTestMessage(): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    toolCalls: [],
    contentBlocks: [],
  };
}

describe('StreamController - Text Content', () => {
  let controller: StreamController;
  let deps: StreamControllerDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = createMockDeps();
    controller = new StreamController(deps);
    deps.state.currentContentEl = createMockElement();
  });

  describe('Text streaming', () => {
    it('should append text content to message', async () => {
      const msg = createTestMessage();

      // Set up text element for text streaming
      deps.state.currentTextEl = createMockElement();

      await controller.handleStreamChunk({ type: 'text', content: 'Hello ' }, msg);
      await controller.handleStreamChunk({ type: 'text', content: 'World' }, msg);

      expect(msg.content).toBe('Hello World');
    });

    it('should accumulate text across multiple chunks', async () => {
      const msg = createTestMessage();
      deps.state.currentTextEl = createMockElement();

      const chunks = ['This ', 'is ', 'a ', 'test.'];
      for (const chunk of chunks) {
        await controller.handleStreamChunk({ type: 'text', content: chunk }, msg);
      }

      expect(msg.content).toBe('This is a test.');
    });
  });

  describe('Error and blocked handling', () => {
    it('should append error message on error chunk', async () => {
      const msg = createTestMessage();
      deps.state.currentTextEl = createMockElement();

      await controller.handleStreamChunk(
        { type: 'error', content: 'Something went wrong' },
        msg
      );

      expect(deps.state.currentTextContent).toContain('Error');
    });

    it('should append blocked message on blocked chunk', async () => {
      const msg = createTestMessage();
      deps.state.currentTextEl = createMockElement();

      await controller.handleStreamChunk(
        { type: 'blocked', content: 'Tool was blocked' },
        msg
      );

      expect(deps.state.currentTextContent).toContain('Blocked');
    });
  });

  describe('Done chunk handling', () => {
    it('should handle done chunk without error', async () => {
      const msg = createTestMessage();
      deps.state.currentTextEl = createMockElement();

      // Should not throw
      await expect(
        controller.handleStreamChunk({ type: 'done' }, msg)
      ).resolves.not.toThrow();
    });
  });

  describe('Quiz formatting normalization', () => {
    it('normalizes duplicated 문제 markers and removes answer prompt clutter', async () => {
      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();
      deps.state.currentTextEl = createMockElement();
      deps.state.currentTextContent = [
        '## 1/3번 문제',
        '문제',
        '문제',
        '다음 중 테이블의 "행(row)"에 대한 설명으로 옳은 것은 무엇입니까?',
        '',
        'A. 테이블의 행은 데이터의 항목(속성)을 의미한다.',
        'B. 테이블의 행은 데이터 한 건을 나타낸다.',
        'C. 테이블의 행은 테이블의 이름을 의미한다.',
        'D. 테이블의 행은 항상 중복될 수 있다.',
        '',
        '답안 형식: B',
        '',
        '(정답을 입력해 주세요.)',
      ].join('\n');

      await controller.finalizeCurrentTextBlock(msg);

      expect(msg.contentBlocks?.[0]).toEqual({
        type: 'text',
        content: [
          '## 1/3번 문제',
          '',
          '#### 다음 중 테이블의 "행(row)"에 대한 설명으로 옳은 것은 무엇입니까?',
          '',
          'A. 테이블의 행은 데이터의 항목(속성)을 의미한다.',
          'B. 테이블의 행은 데이터 한 건을 나타낸다.',
          'C. 테이블의 행은 테이블의 이름을 의미한다.',
          'D. 테이블의 행은 항상 중복될 수 있다.',
          '',
          '답안 형식: B',
        ].join('\n'),
      });
    });

    it('preserves quiz question metadata when tool reads precede the final quiz text', async () => {
      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();

      await controller.handleStreamChunk(
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'Week14/notes/a.md' } },
        msg
      );
      await controller.handleStreamChunk(
        { type: 'tool_result', id: 'tool-1', content: 'source note content' },
        msg
      );
      await controller.handleStreamChunk({
        type: 'text',
        content: [
          '## 1/5번 문제',
          '',
          '#### 이름 없는 인라인뷰에서 노트가 지적한 통증이 아닌 것은?',
          '',
          'A. 가독성 문제',
          'B. 의도 불명 문제',
          'C. 수정 부담 문제',
          'D. 성능 향상',
        ].join('\n'),
      }, msg);

      await controller.finalizeCurrentTextBlock(msg);

      expect(msg.quizQuestion).toEqual({
        current: 1,
        total: 5,
        multiSelect: false,
        freeText: false,
        options: [
          { label: 'A', text: '가독성 문제' },
          { label: 'B', text: '의도 불명 문제' },
          { label: 'C', text: '수정 부담 문제' },
          { label: 'D', text: '성능 향상' },
        ],
      });
      expect(msg.contentBlocks?.some((block) => block.type === 'tool_use')).toBe(true);
    });
  });

  describe('Socratic summary parsing', () => {
    it('detects summary markers with leading indentation', async () => {
      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();
      deps.state.currentTextEl = createMockElement();
      deps.state.currentTextContent = [
        '  ##SOCRATIC_SUMMARY##',
        '  ### 발견의 여정 요약',
        '정규화의 핵심을 스스로 정리했어요.',
      ].join('\n');

      await controller.finalizeCurrentTextBlock(msg);

      expect(msg.socraticTurn).toEqual({ isSummary: true });
    });
  });

  describe('Usage handling', () => {
    it('should update usage for current session', async () => {
      const msg = createTestMessage();
      const usage = {
        model: 'model-a',
        inputTokens: 10,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        contextWindow: 100,
        contextTokens: 10,
        percentage: 10,
        premiumRequests: 0.33,
      };

      await controller.handleStreamChunk({ type: 'usage', usage, sessionId: 'session-1' }, msg);

      expect(deps.state.usage).toEqual(usage);
    });

    it('should accumulate premium request usage across chunks in the same session', async () => {
      const msg = createTestMessage();
      const usageA = {
        model: 'model-a',
        inputTokens: 10,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        contextWindow: 100,
        contextTokens: 10,
        percentage: 10,
        premiumRequests: 0.33,
      };
      const usageB = {
        model: 'model-a',
        inputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        contextWindow: 100,
        contextTokens: 20,
        percentage: 20,
        premiumRequests: 1,
      };

      await controller.handleStreamChunk({ type: 'usage', usage: usageA, sessionId: 'session-1' }, msg);
      await controller.handleStreamChunk({ type: 'usage', usage: usageB, sessionId: 'session-1' }, msg);

      expect(deps.state.usage).toEqual({
        ...usageB,
        premiumRequests: 1.33,
      });
    });

    it('should ignore usage from other sessions', async () => {
      const msg = createTestMessage();
      const usage = {
        model: 'model-a',
        inputTokens: 10,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        contextWindow: 100,
        contextTokens: 10,
        percentage: 10,
      };

      await controller.handleStreamChunk({ type: 'usage', usage, sessionId: 'session-2' }, msg);

      expect(deps.state.usage).toBeNull();
    });
  });

  describe('Tool handling', () => {
    it('should record tool_use and add to content blocks', async () => {
      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();

      await controller.handleStreamChunk(
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'notes/test.md' } },
        msg
      );

      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls![0].id).toBe('tool-1');
      expect(msg.toolCalls![0].status).toBe('running');
      expect(msg.contentBlocks).toHaveLength(1);
      expect(msg.contentBlocks![0]).toEqual({ type: 'tool_use', toolId: 'tool-1' });
      expect(deps.updateQueueIndicator).toHaveBeenCalled();
    });

    it('should update tool_result status', async () => {
      const msg = createTestMessage();
      msg.toolCalls = [
        {
          id: 'tool-1',
          name: 'Read',
          input: { file_path: 'notes/test.md' },
          status: 'running',
        } as any,
      ];
      deps.state.currentContentEl = createMockElement();

      await controller.handleStreamChunk(
        { type: 'tool_result', id: 'tool-1', content: 'ok' },
        msg
      );

      expect(msg.toolCalls![0].status).toBe('completed');
      expect(msg.toolCalls![0].result).toBe('ok');
    });

    it('should persist AskUserQuestion answers and render block', async () => {
      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();

      await controller.handleStreamChunk(
        {
          type: 'tool_use',
          id: 'tool-ask-1',
          name: TOOL_ASK_USER_QUESTION,
          input: {
            questions: [
              {
                question: 'Which option?',
                header: 'Q1',
                multiSelect: false,
                options: [
                  { label: 'A', description: '' },
                  { label: 'B', description: '' },
                ],
              },
            ],
          },
        },
        msg
      );

      const agentService = (deps.plugin as any).agentService;
      agentService.getAskUserQuestionAnswers.mockReturnValue({ 'Which option?': 'A' });

      await controller.handleStreamChunk(
        { type: 'tool_result', id: 'tool-ask-1', content: 'ok' },
        msg
      );

      expect(agentService.getAskUserQuestionAnswers).toHaveBeenCalledWith('tool-ask-1');
      expect(msg.toolCalls![0].status).toBe('completed');
      expect(msg.toolCalls![0].input).toMatchObject({
        answers: { 'Which option?': 'A' },
      });
    });

    it('should add subagent entry to contentBlocks for Task tool', async () => {
      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();

      await controller.handleStreamChunk(
        {
          type: 'tool_use',
          id: 'task-1',
          name: TOOL_TASK,
          input: { prompt: 'Do something', subagent_type: 'general-purpose' },
        },
        msg
      );

      expect(msg.contentBlocks).toHaveLength(1);
      expect(msg.contentBlocks![0]).toEqual({ type: 'subagent', subagentId: 'task-1' });
      expect(msg.subagents).toHaveLength(1);
      expect(msg.subagents![0].id).toBe('task-1');
    });

    it('should render as raw tool call when TodoWrite parsing fails', async () => {
      const { parseTodoInput, renderToolCall } = jest.requireMock('@/ui');
      parseTodoInput.mockReturnValue(null); // Simulate parse failure
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const msg = createTestMessage();
      deps.state.currentContentEl = createMockElement();

      try {
        await controller.handleStreamChunk(
          {
            type: 'tool_use',
            id: 'todo-1',
            name: TOOL_TODO_WRITE,
            input: { invalid: 'data' },
          },
          msg
        );

        // Should fall back to rendering as tool call
        expect(msg.contentBlocks).toHaveLength(1);
        expect(msg.contentBlocks![0]).toEqual({ type: 'tool_use', toolId: 'todo-1' });
        expect(renderToolCall).toHaveBeenCalled();

        // Should not update currentTodos
        expect(deps.state.currentTodos).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
          '[StreamController] TodoWrite input parsing failed',
          expect.objectContaining({ toolId: 'todo-1', inputKeys: ['invalid'] })
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});

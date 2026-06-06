/**
 * Tests for InputController - Message Queue and Input Handling
 */

import { InputController, type InputControllerDeps } from '@/features/chat/controllers/InputController';
import { ChatState } from '@/features/chat/state/ChatState';

// Helper to create mock DOM element
function createMockElement() {
  const style: Record<string, string> = { display: 'none' };
  return {
    style,
    setText: jest.fn((text: string) => {
      (createMockElement as any).lastText = text;
    }),
    get textContent() {
      return (createMockElement as any).lastText || '';
    },
  };
}

// Helper to create mock input element
function createMockInputEl() {
  return {
    value: '',
    focus: jest.fn(),
  } as unknown as HTMLTextAreaElement;
}

function createMockChatContainer() {
  const inputWrapper = { style: { display: '' } } as any;
  let quizPanel: any = {
    remove: jest.fn(() => {
      quizPanel = null;
    }),
  };

  const container = {
    querySelector: jest.fn((selector: string) => {
      if (selector === '.ocop-quiz-answer-panel') {
        return quizPanel;
      }
      if (selector === '.ocop-input-wrapper') {
        return inputWrapper;
      }
      return null;
    }),
  } as any;

  const messagesEl = { parentElement: container } as any;

  return {
    container,
    inputWrapper,
    messagesEl,
    attachQuizPanel: () => {
      quizPanel = {
        remove: jest.fn(() => {
          quizPanel = null;
        }),
      };
      return quizPanel;
    },
  };
}

// Helper to create mock image context manager
function createMockImageContextManager() {
  return {
    hasImages: jest.fn().mockReturnValue(false),
    getAttachedImages: jest.fn().mockReturnValue([]),
    clearImages: jest.fn(),
    setImages: jest.fn(),
  };
}

async function* createMockStream(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// Helper to create mock dependencies
function createMockDeps(overrides: Partial<InputControllerDeps> = {}): InputControllerDeps {
  const state = new ChatState();
  const inputEl = createMockInputEl();
  const queueIndicatorEl = createMockElement();
  state.queueIndicatorEl = queueIndicatorEl as any;

  // Store image context manager so tests can access it
  const imageContextManager = createMockImageContextManager();

  return {
    plugin: {
      agentService: {
        query: jest.fn(),
        cancel: jest.fn(),
        resetSession: jest.fn(),
        setApprovedPlanContent: jest.fn(),
        setCurrentPlanFilePath: jest.fn(),
      },
      saveSettings: jest.fn(),
      settings: {
        slashCommands: [],
        blockedCommands: { unix: [], windows: [] },
        enableBlocklist: true,
        permissionMode: 'yolo',
        enableAutoTitleGeneration: true,
      },
      mcpService: {
        extractMentions: jest.fn().mockReturnValue(new Set()),
        transformMentions: jest.fn().mockImplementation((text: string) => text),
      },
      renameConversation: jest.fn(),
      updateConversation: jest.fn(),
      getConversationById: jest.fn().mockReturnValue(null),
    } as any,
    state,
    renderer: {
      addMessage: jest.fn().mockReturnValue({
        querySelector: jest.fn().mockReturnValue(createMockElement()),
      }),
    } as any,
    streamController: {
      showThinkingIndicator: jest.fn(),
      hideThinkingIndicator: jest.fn(),
      handleStreamChunk: jest.fn(),
      finalizeCurrentTextBlock: jest.fn(),
      finalizeCurrentThinkingBlock: jest.fn(),
      appendText: jest.fn(),
      injectChoiceButtonsIfNeeded: jest.fn(),
    } as any,
    selectionController: {
      getContext: jest.fn().mockReturnValue(null),
    } as any,
    conversationController: {
      save: jest.fn(),
      generateFallbackTitle: jest.fn().mockReturnValue('Test Title'),
      updateHistoryDropdown: jest.fn(),
    } as any,
    getInputEl: () => inputEl,
    getWelcomeEl: () => null,
    getMessagesEl: () => createMockElement() as any,
    getFileContextManager: () => ({
      startSession: jest.fn(),
      getCurrentNotePath: jest.fn().mockReturnValue(null),
      shouldSendCurrentNote: jest.fn().mockReturnValue(false),
      markCurrentNoteSent: jest.fn(),
      transformContextMentions: jest.fn().mockImplementation((text: string) => text),
    }) as any,
    getImageContextManager: () => imageContextManager as any,
    getSlashCommandManager: () => null,
    getMcpServerSelector: () => null,
    getWebSearchToggle: () => ({ isEnabled: jest.fn().mockReturnValue(false) }),
    getExternalContextSelector: () => null,
    getInstructionModeManager: () => null,
    getInstructionRefineService: () => null,
    getTitleGenerationService: () => null,
    getComponent: () => ({} as any),
    setPlanModeActive: jest.fn(),
    getPlanBanner: () => null,
    generateId: () => `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    resetContextMeter: jest.fn(),
    ...overrides,
  };
}

describe('InputController - Message Queue', () => {
  let controller: InputController;
  let deps: InputControllerDeps;
  let inputEl: ReturnType<typeof createMockInputEl>;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = createMockDeps();
    inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
    controller = new InputController(deps);
  });

  describe('Queuing messages while streaming', () => {
    it('should queue message when isStreaming is true', async () => {
      deps.state.isStreaming = true;
      inputEl.value = 'queued message';

      await controller.sendMessage();

      expect(deps.state.queuedMessage).toEqual({
        content: 'queued message',
        images: undefined,
        editorContext: null,
        hidden: undefined,
        promptPrefix: undefined,
      });
      expect(inputEl.value).toBe('');
    });

    it('should queue message with images when streaming', async () => {
      deps.state.isStreaming = true;
      inputEl.value = 'queued with images';
      const mockImages = [{ id: 'img1', name: 'test.png' }];
      const imageContextManager = deps.getImageContextManager()!;
      (imageContextManager.hasImages as jest.Mock).mockReturnValue(true);
      (imageContextManager.getAttachedImages as jest.Mock).mockReturnValue(mockImages);

      await controller.sendMessage();

      expect(deps.state.queuedMessage).toEqual({
        content: 'queued with images',
        images: mockImages,
        editorContext: null,
        hidden: undefined,
        promptPrefix: undefined,
      });
      expect(imageContextManager.clearImages).toHaveBeenCalled();
    });

    it('should append new message to existing queued message', async () => {
      deps.state.isStreaming = true;
      inputEl.value = 'first message';
      await controller.sendMessage();

      inputEl.value = 'second message';
      await controller.sendMessage();

      expect(deps.state.queuedMessage!.content).toBe('first message\n\nsecond message');
    });

    it('should preserve prompt prefix when queuing', async () => {
      deps.state.isStreaming = true;
      inputEl.value = 'queued plan';

      await controller.sendMessage({ promptPrefix: 'Plan prefix' });

      expect(deps.state.queuedMessage?.promptPrefix).toBe('Plan prefix');
    });

    it('should merge images when appending to queue', async () => {
      deps.state.isStreaming = true;
      const imageContextManager = deps.getImageContextManager()!;

      // First message with image
      inputEl.value = 'first';
      (imageContextManager.hasImages as jest.Mock).mockReturnValue(true);
      (imageContextManager.getAttachedImages as jest.Mock).mockReturnValue([{ id: 'img1' }]);
      await controller.sendMessage();

      // Second message with another image
      inputEl.value = 'second';
      (imageContextManager.getAttachedImages as jest.Mock).mockReturnValue([{ id: 'img2' }]);
      await controller.sendMessage();

      expect(deps.state.queuedMessage!.images).toHaveLength(2);
      expect(deps.state.queuedMessage!.images![0].id).toBe('img1');
      expect(deps.state.queuedMessage!.images![1].id).toBe('img2');
    });

    it('should not queue empty message', async () => {
      deps.state.isStreaming = true;
      inputEl.value = '';
      const imageContextManager = deps.getImageContextManager()!;
      (imageContextManager.hasImages as jest.Mock).mockReturnValue(false);

      await controller.sendMessage();

      expect(deps.state.queuedMessage).toBeNull();
    });
  });

  describe('Queued message processing', () => {
    it('should forward prompt prefix when sending queued message in non-plan mode', async () => {
      jest.useFakeTimers();
      try {
        deps.plugin.settings.permissionMode = 'ask';
        deps.state.queuedMessage = {
          content: 'queued plan',
          images: undefined,
          editorContext: null,
          promptPrefix: 'Plan prefix',
        };

        const sendSpy = jest.spyOn(controller, 'sendMessage').mockResolvedValue(undefined);

        (controller as any).processQueuedMessage();
        jest.runAllTimers();
        await Promise.resolve();

        expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ promptPrefix: 'Plan prefix' }));
        sendSpy.mockRestore();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Queue indicator UI', () => {
    it('should show queue indicator when message is queued', () => {
      deps.state.queuedMessage = { content: 'test message', images: undefined, editorContext: null };

      controller.updateQueueIndicator();

      const queueIndicatorEl = deps.state.queueIndicatorEl as any;
      expect(queueIndicatorEl.setText).toHaveBeenCalledWith('⌙ Queued: test message');
      expect(queueIndicatorEl.style.display).toBe('block');
    });

    it('should hide queue indicator when no message is queued', () => {
      deps.state.queuedMessage = null;

      controller.updateQueueIndicator();

      const queueIndicatorEl = deps.state.queueIndicatorEl as any;
      expect(queueIndicatorEl.style.display).toBe('none');
    });

    it('should truncate long message preview in indicator', () => {
      const longMessage = 'a'.repeat(100);
      deps.state.queuedMessage = { content: longMessage, images: undefined, editorContext: null };

      controller.updateQueueIndicator();

      const queueIndicatorEl = deps.state.queueIndicatorEl as any;
      const call = queueIndicatorEl.setText.mock.calls[0][0] as string;
      expect(call).toContain('...');
    });

    it('should include [images] when queue message has images', () => {
      const mockImages = [{ id: 'img1', name: 'test.png' }];
      deps.state.queuedMessage = { content: 'queued content', images: mockImages as any, editorContext: null };

      controller.updateQueueIndicator();

      const queueIndicatorEl = deps.state.queueIndicatorEl as any;
      const call = queueIndicatorEl.setText.mock.calls[0][0] as string;
      expect(call).toContain('queued content');
      expect(call).toContain('[images]');
    });

    it('should show [images] when queue message has only images', () => {
      const mockImages = [{ id: 'img1', name: 'test.png' }];
      deps.state.queuedMessage = { content: '', images: mockImages as any, editorContext: null };

      controller.updateQueueIndicator();

      const queueIndicatorEl = deps.state.queueIndicatorEl as any;
      expect(queueIndicatorEl.setText).toHaveBeenCalledWith('⌙ Queued: [images]');
    });
  });

  describe('Clearing queued message', () => {
    it('should clear queued message and update indicator', () => {
      deps.state.queuedMessage = { content: 'test', images: undefined, editorContext: null };

      controller.clearQueuedMessage();

      expect(deps.state.queuedMessage).toBeNull();
      const queueIndicatorEl = deps.state.queueIndicatorEl as any;
      expect(queueIndicatorEl.style.display).toBe('none');
    });
  });

  describe('Cancel streaming', () => {
    it('should clear queue on cancel', () => {
      deps.state.queuedMessage = { content: 'test', images: undefined, editorContext: null };
      deps.state.isStreaming = true;

      controller.cancelStreaming();

      expect(deps.state.queuedMessage).toBeNull();
      expect(deps.state.cancelRequested).toBe(true);
      expect(deps.plugin.agentService.cancel).toHaveBeenCalled();
    });

    it('should not cancel if not streaming', () => {
      deps.state.isStreaming = false;

      controller.cancelStreaming();

      expect(deps.plugin.agentService.cancel).not.toHaveBeenCalled();
    });
  });

  describe('Sending messages', () => {
    it('should send message, hide welcome, and save conversation', async () => {
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = deps.getImageContextManager()!;

      deps.getWelcomeEl = () => welcomeEl;
      deps.getFileContextManager = () => fileContextManager as any;
      deps.state.currentConversationId = 'conv-1';
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));

      inputEl.value = 'See ![[image.png]]';

      await controller.sendMessage();

      expect(welcomeEl.style.display).toBe('none');
      expect(fileContextManager.startSession).toHaveBeenCalled();
      expect(deps.renderer.addMessage).toHaveBeenCalledTimes(2);
      expect(deps.state.messages).toHaveLength(2);
      expect(deps.state.messages[0].content).toBe('See ![[image.png]]');
      expect(deps.state.messages[0].images).toBeUndefined();
      expect(imageContextManager.clearImages).toHaveBeenCalled();
      expect(deps.plugin.renameConversation).toHaveBeenCalledWith('conv-1', 'Test Title');
      expect(deps.conversationController.save).toHaveBeenCalledWith(true);
      expect(deps.plugin.agentService.query).toHaveBeenCalled();
      expect(deps.state.isStreaming).toBe(false);
    });

    it('should prepend current note only once per session', async () => {
      const prompts: string[] = [];
      let currentNoteSent = false;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue('notes/session.md'),
        shouldSendCurrentNote: jest.fn().mockImplementation(() => !currentNoteSent),
        markCurrentNoteSent: jest.fn().mockImplementation(() => { currentNoteSent = true; }),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };

      deps.getFileContextManager = () => fileContextManager as any;
      deps.plugin.agentService.query = jest.fn().mockImplementation((prompt: string) => {
        prompts.push(prompt);
        return createMockStream([{ type: 'done' }]);
      });

      inputEl.value = 'First message';
      await controller.sendMessage();

      inputEl.value = 'Second message';
      await controller.sendMessage();

      expect(prompts[0]).toContain('<current_note>');
      expect(prompts[1]).not.toContain('<current_note>');
    });

    it('should include MCP options in query when mentions are present', async () => {
      const mcpMentions = new Set(['server-a']);
      const enabledServers = new Set(['server-b']);

      deps.plugin.mcpService.extractMentions = jest.fn().mockReturnValue(mcpMentions);
      deps.getMcpServerSelector = () => ({
        getEnabledServers: () => enabledServers,
      }) as any;
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));

      inputEl.value = '@server-a hello';

      await controller.sendMessage();

      const queryCall = (deps.plugin.agentService.query as jest.Mock).mock.calls[0];
      const queryOptions = queryCall[3];
      expect(queryOptions.mcpMentions).toBe(mcpMentions);
      expect(queryOptions.enabledMcpServers).toBe(enabledServers);
    });

    it('should send hidden message with content override without clearing input', async () => {
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));
      inputEl.value = 'draft message';

      await controller.sendMessage({ hidden: true, content: 'Auto prompt' });

      expect(inputEl.value).toBe('draft message');
      expect(deps.state.messages[0].content).toBe('Auto prompt');
      expect(deps.state.messages[0].hidden).toBe(true);
      expect(deps.renderer.addMessage).toHaveBeenCalledTimes(1);
    });

    it('infers quiz session state for toolbar-launched quiz prompts', async () => {
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));
      const displayContent = '/quiz · 현재 노트 · db.md · 4문제 · 중 · 정규화';

      await controller.sendMessage({
        content: 'Generated quiz prompt',
        displayContentOverride: displayContent,
      });

      expect(deps.state.quizSession).toEqual({
        totalQuestions: 4,
        currentQuestion: 1,
        scopeLabel: displayContent,
        focusText: '정규화',
      });
      const prompt = (deps.plugin.agentService.query as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).not.toContain('You are continuing an active quiz');
    });

    it('keeps quiz continuation prompts grounded in the original quiz source', async () => {
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));
      deps.state.quizSession = {
        totalQuestions: 5,
        currentQuestion: 1,
        scopeLabel: '/quiz · 현재 노트 · db.md · 5문제 · 중 · 전체 범위',
        difficulty: '중',
        sourceInstruction: 'Use only the current note as ground truth source material: @db.md',
      };

      await controller.sendMessage({ content: 'C' });

      const prompt = (deps.plugin.agentService.query as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('You are continuing an active quiz');
      expect(prompt).toContain('@db.md');
      expect(prompt).toContain('Do not use any knowledge outside the selected ground truth notes/folder');
      expect(prompt).toContain('Continue the SAME quiz scope');
      expect(prompt).toContain('## {N}/{T}번 문제');
      expect(deps.state.quizSession?.currentQuestion).toBe(2);
    });

    it('injects the exact previous quiz question when grading a bare answer after progression', async () => {
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));
      deps.state.quizSession = {
        totalQuestions: 5,
        currentQuestion: 2,
        scopeLabel: '/quiz · 폴더 · Week14/notes · 5문제 · 중 · 전체 범위',
        difficulty: '중',
        sourceInstruction: 'Use only these selected notes as ground truth source material: @Week14/notes/a.md, @Week14/notes/b.md',
      };
      deps.state.addMessage({
        id: 'assistant-q1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        contentBlocks: [{
          type: 'text',
          content: [
            '## 1/5번 문제',
            '',
            '#### 이름 없는 인라인뷰(중첩)에서 노트가 지적한 통증이 아닌 것은 무엇입니까?',
            '',
            'A. 가독성 문제 — 읽는 순서와 실행 순서가 반대여서 혼란이 생긴다.',
            'B. 의도 불명 문제 — 서브쿼리의 목적이 코드만으로 드러나지 않는다.',
            'C. 수정 부담 문제 — 조건을 바꾸려면 깊은 괄호 안을 찾아 여러 곳을 고쳐야 한다.',
            'D. 성능 향상 — 중첩으로 인해 실행 속도가 항상 빨라진다.',
          ].join('\n'),
        }],
        quizQuestion: {
          current: 1,
          total: 5,
          multiSelect: false,
          freeText: false,
          options: [
            { label: 'A', text: '가독성 문제 — 읽는 순서와 실행 순서가 반대여서 혼란이 생긴다.' },
            { label: 'B', text: '의도 불명 문제 — 서브쿼리의 목적이 코드만으로 드러나지 않는다.' },
            { label: 'C', text: '수정 부담 문제 — 조건을 바꾸려면 깊은 괄호 안을 찾아 여러 곳을 고쳐야 한다.' },
            { label: 'D', text: '성능 향상 — 중첩으로 인해 실행 속도가 항상 빨라진다.' },
          ],
        },
      });

      await controller.sendMessage({ content: 'D' });

      const prompt = (deps.plugin.agentService.query as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('student is answering question 1 of 5');
      expect(prompt).toContain('ask exactly question 2 of 5');
      expect(prompt).toContain('<quiz_question_to_grade>');
      expect(prompt).toContain('이름 없는 인라인뷰(중첩)');
      expect(prompt).toContain('D. 성능 향상 — 중첩으로 인해 실행 속도가 항상 빨라진다.');
      expect(prompt).toContain('Use <quiz_question_to_grade> as the grading target');
      expect(deps.state.quizSession?.currentQuestion).toBe(3);
    });

    it('enables web search and context7 for high-difficulty quiz launches', () => {
      const setEnabled = jest.fn();
      const addMentionedServers = jest.fn();
      deps = createMockDeps({
        getWebSearchToggle: () => ({
          isEnabled: jest.fn().mockReturnValue(false),
          setEnabled,
        }),
        getMcpServerSelector: () => ({
          getEnabledServers: () => new Set(),
          addMentionedServers,
        }) as any,
      });
      controller = new InputController(deps);

      (controller as any).enableQuizExternalTools();

      expect(setEnabled).toHaveBeenCalledWith(true);
      expect(addMentionedServers).toHaveBeenCalledWith(new Set(['context7']));
    });

    describe('Mode switching cleanup', () => {
      it('clears active quiz state and answer panel before starting socratic mode', async () => {
        const { inputWrapper, messagesEl, container, attachQuizPanel } = createMockChatContainer();
        const showSocraticBanner = jest.fn();

        deps = createMockDeps({
          getMessagesEl: () => messagesEl,
          showSocraticBanner,
        });
        controller = new InputController(deps);
        deps.state.quizSession = {
          totalQuestions: 5,
          currentQuestion: 2,
          scopeLabel: '기존 퀴즈',
        };
        inputWrapper.style.display = 'none';
        attachQuizPanel();

        deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));

        await controller.sendMessage({
          content: '학습 모드로 전환',
          socraticSessionInit: {
            scopeLabel: '학습 범위',
            focusText: '트랜잭션',
            sourceInstruction: 'The following note is the source material for the dialogue: @db.md',
          },
        });

        const prompt = (deps.plugin.agentService.query as jest.Mock).mock.calls[0][0] as string;
        expect(prompt).not.toContain('You are continuing an active quiz.');
        expect(deps.state.quizSession).toBeNull();
        expect(deps.state.socraticSession?.scopeLabel).toBe('학습 범위');
        expect(deps.state.socraticSession?.sourceInstruction).toBe('The following note is the source material for the dialogue: @db.md');
        expect(deps.state.socraticSession?.supportLevel).toBe(1);
        expect(showSocraticBanner).toHaveBeenCalledWith('학습 범위', '트랜잭션');
        expect(container.querySelector('.ocop-quiz-answer-panel')).toBeNull();
        expect(inputWrapper.style.display).toBe('');
      });

      it('keeps Socratic continuation prompts grounded and adapts support when stuck', async () => {
        deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));
        deps.state.socraticSession = {
          maxDepth: 20,
          currentDepth: 2,
          scopeLabel: '/socratic · 현재 노트 · db.md · 전체 범위',
          focusText: 'CTE vs VIEW',
          sourceInstruction: 'The following note is the source material for the dialogue: @db.md',
          supportLevel: 1,
          isSummaryPhase: false,
        };

        await controller.sendMessage({ content: '모르겠어요' });

        const prompt = (deps.plugin.agentService.query as jest.Mock).mock.calls[0][0] as string;
        expect(prompt).toContain('[SOCRATIC SESSION');
        expect(prompt).toContain('Mark\'s digital teaching twin');
        expect(prompt).toContain('@db.md');
        expect(prompt).toContain('CTE vs VIEW');
        expect(prompt).toContain('Current mode: rescue');
        expect(prompt).toContain('Do not run a twenty-questions game');
        expect(deps.state.socraticSession?.supportLevel).toBe(2);
      });

      it('clears active socratic state before starting quiz mode', async () => {
        const hideSocraticBanner = jest.fn();

        deps = createMockDeps({
          hideSocraticBanner,
        });
        controller = new InputController(deps);
        deps.state.socraticSession = {
          maxDepth: 20,
          currentDepth: 4,
          scopeLabel: '기존 학습',
          focusText: '정규화',
          isSummaryPhase: false,
        };
        deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));

        await controller.sendMessage({
          content: '새 퀴즈 시작',
          quizSessionInit: {
            totalQuestions: 3,
            scopeLabel: '새 퀴즈',
            focusText: 'PK',
          },
        });

        const prompt = (deps.plugin.agentService.query as jest.Mock).mock.calls[0][0] as string;
        expect(prompt).not.toContain('[SOCRATIC SESSION');
        expect(deps.state.socraticSession).toBeNull();
        expect(hideSocraticBanner).toHaveBeenCalled();
        expect(deps.state.quizSession).toEqual({
          totalQuestions: 3,
          currentQuestion: 1,
          scopeLabel: '새 퀴즈',
          focusText: 'PK',
          difficulty: undefined,
          sourceInstruction: undefined,
        });
      });
    });
  });

  describe('Plan mode', () => {
    it('clears stale plan file path when starting plan mode in plan permission', async () => {
      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([{ type: 'done' }])
      );
      deps.plugin.settings.permissionMode = 'plan';
      inputEl.value = 'Plan this';

      await controller.sendPlanModeMessage();

      expect(deps.plugin.agentService.setCurrentPlanFilePath).toHaveBeenCalledWith(null);
    });

    it('sends plan mode request prefix without switching permission', async () => {
      deps.plugin.agentService.query = jest.fn().mockImplementation((prompt: string) => {
        expect(prompt).toContain('User requested plan mode. Call EnterPlanMode before responding.');
        return createMockStream([{ type: 'done' }]);
      });
      deps.plugin.settings.permissionMode = 'ask';
      inputEl.value = 'Plan this';

      await controller.sendPlanModeMessage();

      expect(deps.plugin.settings.permissionMode).toBe('ask');
      expect(deps.state.planModeState).toBeNull();
      expect(deps.state.messages[0].content).toBe('Plan this');
    });

    it('routes queued messages through plan mode when permissionMode is plan', async () => {
      jest.useFakeTimers();
      try {
        deps.plugin.settings.permissionMode = 'plan';
        deps.state.queuedMessage = { content: 'Queued plan', images: undefined, editorContext: null };

        const sendPlanModeSpy = jest
          .spyOn(controller as any, 'sendMessageWithPlanMode')
          .mockResolvedValue(undefined);
        const sendSpy = jest.spyOn(controller, 'sendMessage').mockResolvedValue(undefined);

        (controller as any).processQueuedMessage();
        jest.runAllTimers();
        await Promise.resolve();

        expect(sendPlanModeSpy).toHaveBeenCalledWith(
          expect.objectContaining({ content: 'Queued plan' })
        );
        expect(sendSpy).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('activates plan permission mode after EnterPlanMode is pending', async () => {
      deps.plugin.agentService.query = jest.fn().mockImplementation(() => createMockStream([{ type: 'done' }]));
      deps.plugin.settings.permissionMode = 'ask';
      inputEl.value = 'Original request';

      await controller.handleEnterPlanMode();
      expect(deps.state.planModeActivationPending).toBe(true);

      await controller.sendMessage();

      expect(deps.plugin.settings.permissionMode).toBe('plan');
      expect(deps.plugin.saveSettings).toHaveBeenCalled();
      expect(deps.state.planModeState?.isActive).toBe(true);
      expect(deps.state.planModeState?.agentInitiated).toBe(true);
    });

    it('should send hidden plan mode message without rendering user bubble', async () => {
      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([{ type: 'done' }])
      );
      deps.plugin.settings.permissionMode = 'plan';
      const imageContextManager = deps.getImageContextManager()!;

      await (controller as any).sendMessageWithPlanMode({
        content: 'Revise plan',
        hidden: true,
        images: [],
      });

      expect(deps.state.messages[0].hidden).toBe(true);
      expect(deps.renderer.addMessage).toHaveBeenCalledTimes(1);
      expect(imageContextManager.clearImages).not.toHaveBeenCalled();
    });
  });

  describe('Title generation', () => {
    it('should set pending status and fallback title after first exchange', async () => {
      const mockTitleService = {
        generateTitle: jest.fn().mockResolvedValue(undefined),
        cancel: jest.fn(),
      };
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
        getTitleGenerationService: () => mockTitleService as any,
      });
      deps.state.currentConversationId = 'conv-1';

      // Mock the agent query to return a text response
      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([
          { type: 'text', content: 'Hello, how can I help?' },
          { type: 'done' },
        ])
      );

      // Mock handleStreamChunk to populate assistant content
      (deps.streamController.handleStreamChunk as jest.Mock).mockImplementation(async (chunk, msg) => {
        if (chunk.type === 'text') {
          msg.content = chunk.content;
        }
      });

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Hello world';
      controller = new InputController(deps);

      await controller.sendMessage();

      // After first exchange (2 messages), should set pending status (only when titleService available and content exists)
      expect(deps.plugin.updateConversation).toHaveBeenCalledWith('conv-1', { titleGenerationStatus: 'pending' });
      expect(deps.plugin.renameConversation).toHaveBeenCalledWith('conv-1', 'Test Title');
    });

    it('should find messages by role, not by index', async () => {
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
      });
      deps.state.currentConversationId = 'conv-1';

      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([{ type: 'done' }])
      );

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Test message';
      controller = new InputController(deps);

      await controller.sendMessage();

      // Verify messages are found by role
      const userMsg = deps.state.messages.find(m => m.role === 'user');
      const assistantMsg = deps.state.messages.find(m => m.role === 'assistant');
      expect(userMsg).toBeDefined();
      expect(assistantMsg).toBeDefined();
    });

    it('should call title generation service when available', async () => {
      const mockTitleService = {
        generateTitle: jest.fn().mockResolvedValue(undefined),
        cancel: jest.fn(),
      };
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
        getTitleGenerationService: () => mockTitleService as any,
      });
      deps.state.currentConversationId = 'conv-1';

      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([
          { type: 'text', content: 'Response text' },
          { type: 'done' },
        ])
      );

      // Mock handleStreamChunk to populate assistant content
      (deps.streamController.handleStreamChunk as jest.Mock).mockImplementation(async (chunk, msg) => {
        if (chunk.type === 'text') {
          msg.content = chunk.content;
        }
      });

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Hello world';
      controller = new InputController(deps);

      await controller.sendMessage();

      // Title service should be called with user and assistant content
      expect(mockTitleService.generateTitle).toHaveBeenCalled();
      const callArgs = mockTitleService.generateTitle.mock.calls[0];
      expect(callArgs[0]).toBe('conv-1'); // conversationId
      expect(callArgs[1]).toContain('Hello world'); // user content
    });

    it('should not overwrite user-renamed title in callback', async () => {
      const mockTitleService = {
        generateTitle: jest.fn().mockResolvedValue(undefined),
        cancel: jest.fn(),
      };
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
        getTitleGenerationService: () => mockTitleService as any,
      });
      deps.state.currentConversationId = 'conv-1';

      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([
          { type: 'text', content: 'Response' },
          { type: 'done' },
        ])
      );

      (deps.streamController.handleStreamChunk as jest.Mock).mockImplementation(async (chunk, msg) => {
        if (chunk.type === 'text') {
          msg.content = chunk.content;
        }
      });

      // Mock getConversationById to return a conversation with different title (user renamed)
      (deps.plugin.getConversationById as jest.Mock).mockReturnValue({
        id: 'conv-1',
        title: 'User Custom Title', // User renamed it
      });

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Test';
      controller = new InputController(deps);

      await controller.sendMessage();

      // Get the callback and simulate it being called
      const callback = mockTitleService.generateTitle.mock.calls[0][3];
      await callback('conv-1', { success: true, title: 'AI Generated Title' });

      // Should clear status since user manually renamed (not apply AI title)
      expect(deps.plugin.updateConversation).toHaveBeenCalledWith('conv-1', { titleGenerationStatus: undefined });
    });

    it('should not set pending status when titleService is null', async () => {
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
        getTitleGenerationService: () => null, // No title service
      });
      deps.state.currentConversationId = 'conv-1';

      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([
          { type: 'text', content: 'Response' },
          { type: 'done' },
        ])
      );

      (deps.streamController.handleStreamChunk as jest.Mock).mockImplementation(async (chunk, msg) => {
        if (chunk.type === 'text') {
          msg.content = chunk.content;
        }
      });

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Test message';
      controller = new InputController(deps);

      await controller.sendMessage();

      // Should NOT set pending status when no titleService
      const updateCalls = (deps.plugin.updateConversation as jest.Mock).mock.calls;
      const pendingCall = updateCalls.find((call: [string, { titleGenerationStatus?: string }]) =>
        call[1]?.titleGenerationStatus === 'pending'
      );
      expect(pendingCall).toBeUndefined();
    });

    it('should not set pending status when assistantText is empty', async () => {
      const mockTitleService = {
        generateTitle: jest.fn().mockResolvedValue(undefined),
        cancel: jest.fn(),
      };
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
        getTitleGenerationService: () => mockTitleService as any,
      });
      deps.state.currentConversationId = 'conv-1';

      // Return empty stream - no text content
      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([{ type: 'done' }])
      );

      // Don't populate assistant content (leave it empty)
      (deps.streamController.handleStreamChunk as jest.Mock).mockImplementation(async () => {});

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Test message';
      controller = new InputController(deps);

      await controller.sendMessage();

      // Should NOT call title service when assistantText is empty
      expect(mockTitleService.generateTitle).not.toHaveBeenCalled();

      // Should NOT set pending status when assistantText is empty
      const updateCalls = (deps.plugin.updateConversation as jest.Mock).mock.calls;
      const pendingCall = updateCalls.find((call: [string, { titleGenerationStatus?: string }]) =>
        call[1]?.titleGenerationStatus === 'pending'
      );
      expect(pendingCall).toBeUndefined();
    });

    it('should NOT call title generation service when enableAutoTitleGeneration is false', async () => {
      const mockTitleService = {
        generateTitle: jest.fn().mockResolvedValue(undefined),
        cancel: jest.fn(),
      };
      const welcomeEl = { style: { display: '' } } as any;
      const fileContextManager = {
        startSession: jest.fn(),
        getCurrentNotePath: jest.fn().mockReturnValue(null),
        shouldSendCurrentNote: jest.fn().mockReturnValue(false),
        markCurrentNoteSent: jest.fn(),
        transformContextMentions: jest.fn().mockImplementation((text: string) => text),
      };
      const imageContextManager = createMockImageContextManager();

      deps = createMockDeps({
        getWelcomeEl: () => welcomeEl,
        getFileContextManager: () => fileContextManager as any,
        getImageContextManager: () => imageContextManager as any,
        getTitleGenerationService: () => mockTitleService as any,
      });
      // Disable auto title generation
      deps.plugin.settings.enableAutoTitleGeneration = false;
      deps.state.currentConversationId = 'conv-1';

      (deps.plugin.agentService.query as jest.Mock).mockReturnValue(
        createMockStream([
          { type: 'text', content: 'Response text' },
          { type: 'done' },
        ])
      );

      (deps.streamController.handleStreamChunk as jest.Mock).mockImplementation(async (chunk, msg) => {
        if (chunk.type === 'text') {
          msg.content = chunk.content;
        }
      });

      inputEl = deps.getInputEl() as ReturnType<typeof createMockInputEl>;
      inputEl.value = 'Hello world';
      controller = new InputController(deps);

      await controller.sendMessage();

      // Title service should NOT be called when setting is disabled
      expect(mockTitleService.generateTitle).not.toHaveBeenCalled();

      // Should NOT set pending status
      const updateCalls = (deps.plugin.updateConversation as jest.Mock).mock.calls;
      const pendingCall = updateCalls.find((call: [string, { titleGenerationStatus?: string }]) =>
        call[1]?.titleGenerationStatus === 'pending'
      );
      expect(pendingCall).toBeUndefined();

      // Should still set fallback title
      expect(deps.plugin.renameConversation).toHaveBeenCalledWith('conv-1', 'Test Title');
    });
  });
});

import {
  buildRuntimeMcpConfig,
  detectCopilotCliCapabilities,
  isInvalidMcpConfigError,
  resolveCopilotAllowedTools,
  shouldUseCopilotAllowAllTools,
  translateCopilotJsonEvent,
} from '@/core/agent/CopilotBridgeService';

describe('CopilotBridgeService helpers', () => {
  describe('detectCopilotCliCapabilities', () => {
    it('detects supported flags from help text', () => {
      const capabilities = detectCopilotCliCapabilities(`
        --no-ask-user
        --no-custom-instructions
        --output-format <format>
        --stream <mode>
        --resume [sessionId]
        --model <model>
        --additional-mcp-config <json>
        --disable-mcp-server <server-name>
        --deny-tool [tools...]
        --available-tools [tools...]
        --allow-all-tools
        json
      `);

      expect(capabilities).toEqual({
        noAskUser: true,
        noCustomInstructions: true,
        outputFormatJson: true,
        stream: true,
        resume: true,
        model: true,
        additionalMcpConfig: true,
        disableMcpServer: true,
        denyTool: true,
        availableTools: true,
        allowAllTools: true,
        reasoningEffort: false,
      });
    });

    it('returns false for flags missing from help text', () => {
      expect(detectCopilotCliCapabilities('Usage: copilot')).toEqual({
        noAskUser: false,
        noCustomInstructions: false,
        outputFormatJson: false,
        stream: false,
        resume: false,
        model: false,
        additionalMcpConfig: false,
        disableMcpServer: false,
        denyTool: false,
        availableTools: false,
        allowAllTools: false,
        reasoningEffort: false,
      });
    });
  });

  describe('resolveCopilotAllowedTools', () => {
    it('keeps agent mode unrestricted when no explicit tools are requested', () => {
      expect(resolveCopilotAllowedTools('agent')).toEqual([]);
    });

    it('applies safe guardrails in normal mode', () => {
      expect(resolveCopilotAllowedTools('normal')).toEqual([
        'view',
        'grep',
        'glob',
        'ls',
        'task',
        'agent_output',
        'report_intent',
        'webfetch',
        'websearch',
      ]);
    });

    it('filters requested tools through normal mode guardrails', () => {
      expect(resolveCopilotAllowedTools('normal', ['view', 'bash', 'task'])).toEqual(['view', 'task']);
    });

    it('falls back to plan guardrails when a plan-mode request asks for unsupported tools only', () => {
      expect(resolveCopilotAllowedTools('normal', ['bash', 'write'], true)).toEqual([
        'view',
        'grep',
        'glob',
        'ls',
        'task',
        'agent_output',
        'report_intent',
        'webfetch',
        'websearch',
      ]);
    });

    it('uses plan guardrails in agent mode when plan mode has no explicit tools', () => {
      expect(resolveCopilotAllowedTools('agent', undefined, true)).toEqual([
        'view',
        'grep',
        'glob',
        'ls',
        'task',
        'agent_output',
        'report_intent',
        'webfetch',
        'websearch',
      ]);
    });
  });

  describe('shouldUseCopilotAllowAllTools', () => {
    it('uses allow-all-tools for unrestricted agent mode without explicit tools', () => {
      expect(shouldUseCopilotAllowAllTools('agent', true, undefined, false)).toBe(true);
    });

    it('does not use allow-all-tools in plan mode with default tool guardrails', () => {
      expect(shouldUseCopilotAllowAllTools('agent', true, { planMode: true }, false)).toBe(false);
    });

    it('lets explicit tool requests use available-tools instead of allow-all-tools', () => {
      expect(
        shouldUseCopilotAllowAllTools('agent', true, { allowedTools: ['view'] }, false)
      ).toBe(false);
    });

    it('uses allow-all-tools for MCP routing when no explicit tools are requested', () => {
      expect(shouldUseCopilotAllowAllTools('normal', true, undefined, true)).toBe(true);
    });

    it('falls back when the CLI does not support allow-all-tools', () => {
      expect(shouldUseCopilotAllowAllTools('agent', false, undefined, false)).toBe(false);
    });
  });

  describe('buildRuntimeMcpConfig', () => {
    it('adds required tools and explicit transport types for CLI runtime config', () => {
      const config = buildRuntimeMcpConfig([
        {
          name: 'sequential-thinking',
          config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
          enabled: true,
          contextSaving: false,
        },
        {
          name: 'context7',
          config: {
            type: 'http',
            url: 'https://mcp.context7.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
          enabled: true,
          contextSaving: true,
        },
        {
          name: 'disabled-server',
          config: { command: 'node', args: ['server.js'] },
          enabled: false,
          contextSaving: false,
        },
      ]);

      expect(config).toEqual({
        mcpServers: {
          'sequential-thinking': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
            tools: ['*'],
          },
          context7: {
            type: 'http',
            url: 'https://mcp.context7.com/mcp',
            headers: { Authorization: 'Bearer token' },
            tools: ['*'],
          },
        },
      });
    });
  });

  describe('isInvalidMcpConfigError', () => {
    it('detects CLI schema rejection messages', () => {
      expect(
        isInvalidMcpConfigError(
          'Invalid MCP server configuration in --additional-mcp-config: mcpServers.context7: Invalid input'
        )
      ).toBe(true);
      expect(isInvalidMcpConfigError('spawn EINVAL')).toBe(false);
    });
  });

  describe('translateCopilotJsonEvent', () => {
    it('translates reasoning deltas into thinking chunks', () => {
      expect(translateCopilotJsonEvent({
        type: 'assistant.reasoning_delta',
        data: { deltaContent: 'Thinking...' },
      })).toEqual([{ type: 'thinking', content: 'Thinking...' }]);
    });

    it('translates tool requests from assistant messages', () => {
      expect(translateCopilotJsonEvent({
        type: 'assistant.message',
        data: {
          toolRequests: [
            { toolRequestId: 'call-1', name: 'view', input: { file_path: 'foo.md' } },
          ],
        },
      })).toEqual([
        { type: 'tool_use', id: 'call-1', name: 'view', input: { file_path: 'foo.md' } },
      ]);
    });

    it('translates completed tool executions into tool_result chunks', () => {
      expect(translateCopilotJsonEvent({
        type: 'tool.execution_complete',
        data: {
          toolCallId: 'call-1',
          parentToolCallId: 'parent-1',
          success: true,
          result: { detailedContent: 'done' },
        },
      })).toEqual([
        { type: 'tool_result', id: 'call-1', content: 'done', isError: false, parentToolUseId: 'parent-1', toolName: null },
      ]);
    });

    it('captures session ids from result events', () => {
      let captured: string | null = null;
      expect(translateCopilotJsonEvent({
        type: 'result',
        sessionId: 'session-123',
        exitCode: 0,
      }, (sessionId) => {
        captured = sessionId;
      })).toEqual([]);
      expect(captured).toBe('session-123');
    });

    it('emits a usage chunk when result usage contains token fields', () => {
      expect(translateCopilotJsonEvent({
        type: 'result',
        sessionId: 'session-usage',
        exitCode: 0,
        usage: {
          inputTokens: 40,
          cacheCreationInputTokens: 10,
          cacheReadInputTokens: 0,
          contextWindow: 100,
        },
      })).toEqual([
        {
          type: 'usage',
          sessionId: 'session-usage',
          usage: {
            inputTokens: 40,
            cacheCreationInputTokens: 10,
            cacheReadInputTokens: 0,
            contextWindow: 100,
            contextTokens: 50,
            percentage: 50,
            premiumRequests: 0,
          },
        },
      ]);
    });

    it('emits a premium-only usage chunk when token fields are absent', () => {
      expect(translateCopilotJsonEvent({
        type: 'result',
        exitCode: 0,
        usage: {
          premiumRequests: 0.33,
        },
      })).toEqual([
        {
          type: 'usage',
          sessionId: null,
          usage: {
            inputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            contextWindow: 0,
            contextTokens: 0,
            percentage: 0,
            premiumRequests: 0.33,
          },
        },
      ]);
    });

    it('returns an error chunk for non-zero result exit codes', () => {
      expect(translateCopilotJsonEvent({
        type: 'result',
        exitCode: 2,
      })).toEqual([{ type: 'error', content: 'Copilot exited with code 2' }]);
    });
  });
});

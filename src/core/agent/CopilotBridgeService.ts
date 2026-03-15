import { execFile, type ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type ObsidianCopilotPlugin from '../../main';
import { stripCurrentNotePrefix } from '../../utils/context';
import { findCopilotCLIPath } from '../../utils/copilotCli';
import { getEnhancedPath, parseEnvironmentVariables } from '../../utils/env';
import { normalizePathForFilesystem } from '../../utils/path';
import { buildContextFromHistory, getLastUserMessage } from '../../utils/session';
import type { McpServerManager } from '../mcp';
import { buildSystemPrompt } from '../prompts/mainAgent';
import { TOOL_EDIT, TOOL_WRITE } from '../tools/toolNames';
import type {
  AskUserQuestionCallback,
  ChatMessage,
  ExitPlanModeDecision,
  ImageAttachment,
  StreamChunk,
  ToolDiffData,
  UsageInfo,
} from '../types';

export interface QueryOptions {
  allowedTools?: string[];
  model?: string;
  mcpMentions?: Set<string>;
  enabledMcpServers?: Set<string>;
  planMode?: boolean;
  externalContextPaths?: string[];
}

export type ApprovalCallback = (
  toolName: string,
  input: Record<string, unknown>,
  description: string
) => Promise<'allow' | 'allow-always' | 'deny' | 'cancel'>;

export type ExitPlanModeCallback = (planContent: string) => Promise<ExitPlanModeDecision>;
export type EnterPlanModeCallback = () => Promise<void>;

const MCP_CONFIG_RELATIVE_PATH = '.copilot/mcp.json';
const ALLOWED_TOOLS = [
  'view',
  'grep',
  'glob',
  'ls',
  'task',
  'agent_output',
  'report_intent',
  'webfetch',
  'websearch',
] as const;

const MAX_DIFF_SIZE = 100 * 1024;

interface DiffContentEntry {
  filePath: string;
  content: string | null;
  skippedReason?: 'too_large' | 'unavailable';
}

export function resolveCopilotAllowedTools(
  permissionMode: string,
  requestedTools?: string[],
  planMode?: boolean
): string[] {
  const requested = requestedTools?.map((tool) => tool.trim()).filter(Boolean) ?? [];
  const guardrailTools = planMode
    ? [...ALLOWED_TOOLS]
    : permissionMode === 'agent'
      ? null
      : [...ALLOWED_TOOLS];
  const guardrailSet = guardrailTools ? new Set<string>(guardrailTools) : null;
  const effectiveTools = requested.length > 0
    ? guardrailSet
      ? requested.filter((tool) => guardrailSet.has(tool))
      : requested
    : guardrailTools ?? [];

  return guardrailSet && effectiveTools.length === 0
    ? guardrailTools ?? []
    : effectiveTools;
}

interface CopilotJsonEvent {
  type: string;
  data?: Record<string, unknown>;
  sessionId?: string;
  exitCode?: number;
  usage?: Record<string, unknown>;
}

export function translateCopilotJsonEvent(
  event: CopilotJsonEvent,
  setSessionId?: (sessionId: string) => void
): StreamChunk[] {
  if (event.type === 'assistant.reasoning_delta') {
    const deltaContent = typeof event.data?.deltaContent === 'string' ? event.data.deltaContent : '';
    return deltaContent ? [{ type: 'thinking', content: deltaContent }] : [];
  }

  if (event.type === 'assistant.message_delta') {
    const deltaContent = typeof event.data?.deltaContent === 'string' ? event.data.deltaContent : '';
    return deltaContent ? [{ type: 'text', content: deltaContent }] : [];
  }

  if (event.type === 'assistant.message') {
    const toolRequests = Array.isArray(event.data?.toolRequests) ? event.data.toolRequests : [];
    const chunks: StreamChunk[] = [];

    for (const request of toolRequests) {
      if (!request || typeof request !== 'object') continue;
      const toolRequest = request as Record<string, unknown>;
      const id = typeof toolRequest.id === 'string'
        ? toolRequest.id
        : typeof toolRequest.toolRequestId === 'string'
          ? toolRequest.toolRequestId
          : null;
      const name = typeof toolRequest.name === 'string' ? toolRequest.name : null;
      const input = toolRequest.input;

      if (id && name && input && typeof input === 'object' && !Array.isArray(input)) {
        chunks.push({ type: 'tool_use', id, name, input: input as Record<string, unknown> });
      }
    }

    return chunks;
  }

  if (event.type === 'tool.execution_complete') {
    const toolCallId = typeof event.data?.toolCallId === 'string' ? event.data.toolCallId : null;
    if (!toolCallId) {
      return [];
    }

    const result = event.data?.result;
    const resultRecord = result && typeof result === 'object' && !Array.isArray(result)
      ? result as Record<string, unknown>
      : null;
    const content = typeof resultRecord?.content === 'string'
      ? resultRecord.content
      : typeof resultRecord?.detailedContent === 'string'
        ? resultRecord.detailedContent
        : '';
    const isError = event.data?.success === false;
    const parentToolUseId = typeof event.data?.parentToolCallId === 'string'
      ? event.data.parentToolCallId
      : null;

    return [{
      type: 'tool_result',
      id: toolCallId,
      content,
      isError,
      parentToolUseId,
    }];
  }

  if (event.type === 'result') {
    if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
      setSessionId?.(event.sessionId);
    }
    if (typeof event.exitCode === 'number' && event.exitCode !== 0) {
      return [{ type: 'error', content: `Copilot exited with code ${event.exitCode}` }];
    }

    const usageChunk = buildUsageChunkFromResult(event);
    if (usageChunk) {
      return [usageChunk];
    }
  }

  return [];
}

function buildUsageChunkFromResult(event: CopilotJsonEvent): { type: 'usage'; usage: UsageInfo; sessionId?: string | null } | null {
  const usage = event.usage;
  if (!usage) {
    return null;
  }

  const inputTokens = toFiniteNumber(usage.inputTokens);
  const cacheCreationInputTokens = toFiniteNumber(usage.cacheCreationInputTokens) ?? 0;
  const cacheReadInputTokens = toFiniteNumber(usage.cacheReadInputTokens) ?? 0;
  const contextWindow = toFiniteNumber(usage.contextWindow);
  const premiumRequests = toFiniteNumber(usage.premiumRequests) ?? 0;

  if (inputTokens === null || contextWindow === null || contextWindow <= 0) {
    if (premiumRequests <= 0) {
      return null;
    }

    return {
      type: 'usage',
      sessionId: event.sessionId ?? null,
      usage: {
        inputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        contextWindow: 0,
        contextTokens: 0,
        percentage: 0,
        premiumRequests,
      },
    };
  }

  const contextTokens = inputTokens + cacheCreationInputTokens + cacheReadInputTokens;
  const percentage = Math.max(0, Math.min(100, Math.round((contextTokens / contextWindow) * 100)));

  return {
    type: 'usage',
    sessionId: event.sessionId ?? null,
    usage: {
      inputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
      contextWindow,
      contextTokens,
      percentage,
      premiumRequests,
    },
  };
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface CopilotCliCapabilities {
  noAskUser: boolean;
  noCustomInstructions: boolean;
  outputFormatJson: boolean;
  stream: boolean;
  resume: boolean;
  model: boolean;
  additionalMcpConfig: boolean;
  disableMcpServer: boolean;
  denyTool: boolean;
  availableTools: boolean;
}

export function detectCopilotCliCapabilities(helpText: string): CopilotCliCapabilities {
  return {
    noAskUser: helpText.includes('--no-ask-user'),
    noCustomInstructions: helpText.includes('--no-custom-instructions'),
    outputFormatJson: helpText.includes('--output-format') && helpText.includes('json'),
    stream: helpText.includes('--stream'),
    resume: helpText.includes('--resume'),
    model: helpText.includes('--model'),
    additionalMcpConfig: helpText.includes('--additional-mcp-config'),
    disableMcpServer: helpText.includes('--disable-mcp-server'),
    denyTool: helpText.includes('--deny-tool'),
    availableTools: helpText.includes('--available-tools'),
  };
}

export class CopilotBridgeService {
  private plugin: ObsidianCopilotPlugin;
  private mcpManager: McpServerManager;
  private currentProcess: ChildProcess | null = null;
  private abortController: AbortController | null = null;
  private sessionId: string | null = null;
  private wasInterrupted = false;
  private cachedCopilotPath: string | null | undefined = undefined;
  private cachedCapabilities = new Map<string, CopilotCliCapabilities>();
  private capabilityProbePromises = new Map<string, Promise<CopilotCliCapabilities>>();

  private approvalCallback: ApprovalCallback | null = null;
  private askUserQuestionCallback: AskUserQuestionCallback | null = null;
  private exitPlanModeCallback: ExitPlanModeCallback | null = null;
  private enterPlanModeCallback: EnterPlanModeCallback | null = null;
  private currentPlanFilePath: string | null = null;
  private approvedPlanContent: string | null = null;
  private askUserQuestionAnswers = new Map<string, Record<string, string | string[]>>();
  private isAskUserQuestionSupported = true;
  private originalContents = new Map<string, DiffContentEntry>();
  private pendingDiffData = new Map<string, ToolDiffData>();

  constructor(plugin: ObsidianCopilotPlugin, mcpManager: McpServerManager) {
    this.plugin = plugin;
    this.mcpManager = mcpManager;
  }

  async reloadMcpServers(): Promise<void> {
    await this.mcpManager.loadServers();
  }

  private getCopilotPath(): string | null {
    const settingsPath = this.plugin.settings.copilotCliPath?.trim();
    if (settingsPath) return settingsPath;

    if (this.cachedCopilotPath === undefined) {
      this.cachedCopilotPath = findCopilotCLIPath();
    }
    return this.cachedCopilotPath;
  }

  private getWorkingDirectory(): string {
    const adapter = this.plugin.app.vault.adapter;
    if ('basePath' in adapter && typeof adapter.basePath === 'string') {
      return adapter.basePath;
    }
    return process.cwd();
  }

  private buildSystemPromptText(prompt: string, vaultPath: string, queryOptions?: QueryOptions): string {
    const hasEditorContext = prompt.includes('<editor_selection');
    return buildSystemPrompt({
      mediaFolder: this.plugin.settings.mediaFolder,
      customPrompt: this.plugin.settings.systemPrompt,
      allowedExportPaths: this.plugin.settings.allowedExportPaths,
      externalContextPaths: queryOptions?.externalContextPaths,
      vaultPath,
      hasEditorContext,
      planMode: queryOptions?.planMode,
      appendedPlan: this.approvedPlanContent ?? undefined,
    });
  }

  private injectSystemPrompt(prompt: string, vaultPath: string, queryOptions?: QueryOptions): string {
    const systemPrompt = this.buildSystemPromptText(prompt, vaultPath, queryOptions).trim();
    return `<system_instructions>\n${systemPrompt}\n</system_instructions>\n\n${prompt}`;
  }

  private buildPromptWithHistory(
    prompt: string,
    conversationHistory: ChatMessage[] | undefined,
    vaultPath: string,
    queryOptions?: QueryOptions
  ): string {
    const injectedPrompt = this.injectSystemPrompt(prompt, vaultPath, queryOptions);

    if (this.wasInterrupted && conversationHistory && conversationHistory.length > 0) {
      const historyContext = buildContextFromHistory(conversationHistory);
      this.sessionId = null;
      this.wasInterrupted = false;
      return historyContext ? `${historyContext}\n\nUser: ${injectedPrompt}` : injectedPrompt;
    }

    if (!this.sessionId && conversationHistory && conversationHistory.length > 0) {
      const historyContext = buildContextFromHistory(conversationHistory);
      const lastUserMessage = getLastUserMessage(conversationHistory);
      const actualPrompt = stripCurrentNotePrefix(prompt);
      const shouldAppendPrompt = !lastUserMessage || lastUserMessage.content.trim() !== actualPrompt.trim();
      if (historyContext) {
        return shouldAppendPrompt ? `${historyContext}\n\nUser: ${injectedPrompt}` : historyContext;
      }
    }

    return injectedPrompt;
  }

  private ensureSessionId(): string {
    if (!this.sessionId) {
      this.sessionId = randomUUID();
    }
    return this.sessionId;
  }

  private getCustomEnv(copilotPath: string): NodeJS.ProcessEnv {
    const customEnv = parseEnvironmentVariables(this.plugin.getActiveEnvironmentVariables());
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...customEnv,
      PATH: getEnhancedPath(customEnv.PATH, copilotPath),
    };

    if (this.plugin.settings.githubToken) {
      env.COPILOT_GITHUB_TOKEN = this.plugin.settings.githubToken;
      env.GH_TOKEN = this.plugin.settings.githubToken;
      env.GITHUB_TOKEN = this.plugin.settings.githubToken;
    }

    return env;
  }

  async prewarmCapabilities(): Promise<void> {
    const copilotPath = this.getCopilotPath();
    if (!copilotPath) {
      return;
    }

    await this.getCliCapabilities(copilotPath);
  }

  /** Returns true if CLI capabilities have been probed and cached (CLI is ready). */
  isCliReady(): boolean {
    const copilotPath = this.getCopilotPath();
    if (!copilotPath) return false;
    return this.cachedCapabilities.has(copilotPath);
  }

  private getCliCapabilities(copilotPath: string): Promise<CopilotCliCapabilities> {
    const cached = this.cachedCapabilities.get(copilotPath);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pending = this.capabilityProbePromises.get(copilotPath);
    if (pending) {
      return pending;
    }

    const probePromise = new Promise<CopilotCliCapabilities>((resolve) => {
      execFile(copilotPath, ['--help', 'all'], {
        encoding: 'utf8',
        env: this.getCustomEnv(copilotPath),
      }, (error, stdout, stderr) => {
        const helpText = typeof stdout === 'string' && stdout.trim().length > 0
          ? stdout
          : typeof stderr === 'string'
            ? stderr
            : '';
        const capabilities = detectCopilotCliCapabilities(helpText);
        if (error && helpText.length === 0) {
          resolve(detectCopilotCliCapabilities(''));
          return;
        }
        resolve(capabilities);
      });
    }).then((capabilities) => {
      this.cachedCapabilities.set(copilotPath, capabilities);
      this.capabilityProbePromises.delete(copilotPath);
      return capabilities;
    });

    this.capabilityProbePromises.set(copilotPath, probePromise);
    return probePromise;
  }

  private addMcpArgs(
    args: string[],
    cwd: string,
    capabilities: CopilotCliCapabilities,
    queryOptions?: QueryOptions
  ): void {
    const allServers = this.mcpManager.getServers();
    if (allServers.length === 0) {
      return;
    }

    const configPath = path.join(cwd, MCP_CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(configPath)) {
      return;
    }

    if (capabilities.additionalMcpConfig) {
      args.push('--additional-mcp-config', `@${configPath}`);
    }

    const mentionedServers = queryOptions?.mcpMentions ?? new Set<string>();
    const enabledServers = queryOptions?.enabledMcpServers ?? new Set<string>();
    const activeServerNames = new Set([
      ...Object.keys(this.mcpManager.getActiveServers(new Set([...mentionedServers, ...enabledServers]))),
      ...enabledServers,
    ]);

    for (const server of allServers) {
      if (!activeServerNames.has(server.name) && capabilities.disableMcpServer) {
        args.push('--disable-mcp-server', server.name);
        continue;
      }

      for (const toolName of server.disabledTools ?? []) {
        if (!capabilities.denyTool) {
          break;
        }
        const normalizedTool = toolName.trim();
        if (normalizedTool) {
          args.push('--deny-tool', `${server.name}(${normalizedTool})`);
        }
      }
    }
  }

  private addToolArgs(args: string[], capabilities: CopilotCliCapabilities, queryOptions?: QueryOptions): void {
    const finalTools = resolveCopilotAllowedTools(
      this.plugin.settings.permissionMode,
      queryOptions?.allowedTools,
      queryOptions?.planMode
    );
    if (capabilities.availableTools && finalTools.length > 0) {
      args.push('--available-tools', ...finalTools);
    }
  }

  async *query(
    prompt: string,
    _images?: ImageAttachment[],
    conversationHistory?: ChatMessage[],
    queryOptions?: QueryOptions
  ): AsyncGenerator<StreamChunk> {
    const copilotPath = this.getCopilotPath();
    if (!copilotPath) {
      yield {
        type: 'error',
        content:
          'Copilot CLI not configured. Please set the path in settings or install @github/copilot globally.',
      };
      return;
    }

    const cwd = this.getWorkingDirectory();
    const capabilities = await this.getCliCapabilities(copilotPath);
    this.isAskUserQuestionSupported = !capabilities.noAskUser;
    const fullPrompt = this.buildPromptWithHistory(prompt, conversationHistory, cwd, queryOptions);
    const sessionId = this.ensureSessionId();
    const args = ['--no-color'];

    if (capabilities.noAskUser) {
      args.push('--no-ask-user');
    }
    if (capabilities.noCustomInstructions) {
      args.push('--no-custom-instructions');
    }
    if (capabilities.outputFormatJson) {
      args.push('--output-format', 'json');
    }
    if (capabilities.resume) {
      args.push('--resume', sessionId);
    }
    args.push('-p', fullPrompt, '-s');
    if (capabilities.stream) {
      args.push('--stream', 'on');
    }

    const selectedModel = queryOptions?.model?.trim();
    if (capabilities.model && selectedModel && selectedModel !== 'auto') {
      args.push('--model', selectedModel);
    }

    this.addToolArgs(args, capabilities, queryOptions);
    this.addMcpArgs(args, cwd, capabilities, queryOptions);

    this.abortController = new AbortController();

    try {
      const isPlanMode = queryOptions?.planMode === true;
      let bufferedPlanText = '';
      let sawDone = false;

      for await (const chunk of this.spawnCopilot(copilotPath, args, this.getCustomEnv(copilotPath))) {
        if (chunk.type === 'tool_use') {
          this.trackWriteEditOriginalContent(chunk.id, chunk.name, chunk.input);
        } else if (chunk.type === 'tool_result') {
          this.finalizeWriteEditDiff(chunk.id, !!chunk.isError);
        }

        if (isPlanMode) {
          if (chunk.type === 'text') {
            bufferedPlanText += chunk.content;
            continue;
          }

          if (chunk.type === 'done') {
            sawDone = true;
            continue;
          }
        }

        yield chunk;
      }

      if (isPlanMode) {
        const trimmedPlan = bufferedPlanText.trim();
        if (!this.wasInterrupted && trimmedPlan) {
          if (this.exitPlanModeCallback) {
            await this.exitPlanModeCallback(trimmedPlan);
          } else {
            yield { type: 'text', content: bufferedPlanText };
          }
        }

        if (sawDone) {
          yield { type: 'done' };
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    } finally {
      this.abortController = null;
    }
  }

  private async *spawnCopilot(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv
  ): AsyncGenerator<StreamChunk> {
    const cwd = this.getWorkingDirectory();
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.currentProcess = child;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    const chunks: StreamChunk[] = [];
    let resolveWait: (() => void) | null = null;
    let done = false;

    child.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = this.parseCopilotEvent(trimmed);
        if (!parsed) {
          chunks.push({ type: 'text', content: line + '\n' });
          continue;
        }

        for (const chunk of this.translateCopilotEvent(parsed)) {
          chunks.push(chunk);
        }
      }
      resolveWait?.();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
    });

    child.on('close', (code) => {
      done = true;
      const trailing = stdoutBuffer.trim();
      if (trailing) {
        const parsed = this.parseCopilotEvent(trailing);
        if (parsed) {
          for (const chunk of this.translateCopilotEvent(parsed)) {
            chunks.push(chunk);
          }
        } else {
          chunks.push({ type: 'text', content: stdoutBuffer });
        }
      }
      if (code !== 0 && stderrBuffer.trim()) {
        chunks.push({
          type: 'error',
          content: stderrBuffer.includes('No authentication information found')
            ? 'GitHub Copilot authentication required. Please run "copilot" in terminal and use /login to authenticate.'
            : stderrBuffer.trim(),
        });
      }
      resolveWait?.();
    });

    child.on('error', (err) => {
      done = true;
      chunks.push({
        type: 'error',
        content: `Failed to start Copilot CLI: ${err.message}`,
      });
      resolveWait?.();
    });

    try {
      while (!done || chunks.length > 0) {
        if (chunks.length > 0) {
          const chunk = chunks.shift();
          if (chunk) {
            yield chunk;
          }
          continue;
        }

        if (!done) {
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
          });
        }
      }
    } finally {
      if (this.currentProcess === child) {
        if (!done) {
          child.kill('SIGTERM');
        }
        this.currentProcess = null;
      }
    }

    yield { type: 'done' };
  }

  private parseCopilotEvent(line: string): CopilotJsonEvent | null {
    try {
      return JSON.parse(line) as CopilotJsonEvent;
    } catch {
      return null;
    }
  }

  private translateCopilotEvent(event: CopilotJsonEvent): StreamChunk[] {
    return translateCopilotJsonEvent(event, (sessionId) => {
      this.sessionId = sessionId;
    });
  }

  cancel(): void {
    this.wasInterrupted = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  resetSession(): void {
    this.sessionId = null;
    this.wasInterrupted = false;
    this.askUserQuestionAnswers.clear();
    this.approvedPlanContent = null;
    this.currentPlanFilePath = null;
    this.clearDiffState();
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(id: string | null): void {
    this.sessionId = id;
    this.wasInterrupted = false;
  }

  cleanup(): void {
    this.cancel();
    this.resetSession();
  }

  async *streamQuery(prompt: string): AsyncGenerator<string> {
    for await (const chunk of this.query(prompt)) {
      if (chunk.type === 'text') {
        yield chunk.content;
      } else if (chunk.type === 'error') {
        throw new Error(chunk.content);
      }
    }
  }

  setApprovalCallback(callback: ApprovalCallback | null): void {
    this.approvalCallback = callback;
  }

  setAskUserQuestionCallback(callback: AskUserQuestionCallback | null): void {
    this.askUserQuestionCallback = callback;
  }

  isAskUserQuestionToolSupported(): boolean {
    return this.isAskUserQuestionSupported;
  }

  setExitPlanModeCallback(callback: ExitPlanModeCallback | null): void {
    this.exitPlanModeCallback = callback;
  }

  setEnterPlanModeCallback(callback: EnterPlanModeCallback | null): void {
    this.enterPlanModeCallback = callback;
  }

  private isWriteEditTool(toolName: string): boolean {
    return toolName === TOOL_WRITE || toolName === TOOL_EDIT;
  }

  private resolveVaultFilePath(filePath: string): string {
    const normalizedPath = normalizePathForFilesystem(filePath);
    return path.isAbsolute(normalizedPath) ? normalizedPath : path.join(this.getWorkingDirectory(), normalizedPath);
  }

  private trackWriteEditOriginalContent(
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): void {
    if (!this.isWriteEditTool(toolName)) {
      return;
    }

    const rawPath = toolInput.file_path;
    const filePath = typeof rawPath === 'string' && rawPath ? rawPath : null;
    if (!filePath) {
      return;
    }

    const fullPath = this.resolveVaultFilePath(filePath);
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.size <= MAX_DIFF_SIZE) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          this.originalContents.set(toolUseId, { filePath, content });
        } else {
          this.originalContents.set(toolUseId, { filePath, content: null, skippedReason: 'too_large' });
        }
      } else {
        this.originalContents.set(toolUseId, { filePath, content: '' });
      }
    } catch (error) {
      console.warn('Failed to capture original file contents for diff:', fullPath, error);
      this.originalContents.set(toolUseId, { filePath, content: null, skippedReason: 'unavailable' });
    }
  }

  private finalizeWriteEditDiff(toolUseId: string, isError: boolean): void {
    const originalEntry = this.originalContents.get(toolUseId);
    if (!originalEntry) {
      return;
    }

    const { filePath } = originalEntry;
    if (isError) {
      this.originalContents.delete(toolUseId);
      return;
    }

    const fullPath = this.resolveVaultFilePath(filePath);
    let diffData: ToolDiffData | undefined;

    if (originalEntry.content === null) {
      diffData = { filePath, skippedReason: originalEntry.skippedReason ?? 'unavailable' };
    } else {
      try {
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          if (stats.size <= MAX_DIFF_SIZE) {
            const newContent = fs.readFileSync(fullPath, 'utf-8');
            diffData = {
              filePath,
              originalContent: originalEntry.content,
              newContent,
            };
          } else {
            diffData = { filePath, skippedReason: 'too_large' };
          }
        } else {
          diffData = { filePath, skippedReason: 'unavailable' };
        }
      } catch (error) {
        console.warn('Failed to capture updated file contents for diff:', fullPath, error);
        diffData = { filePath, skippedReason: 'unavailable' };
      }
    }

    if (diffData) {
      this.pendingDiffData.set(toolUseId, diffData);
    }

    this.originalContents.delete(toolUseId);
  }

  getDiffData(toolUseId: string): ToolDiffData | undefined {
    const data = this.pendingDiffData.get(toolUseId);
    if (data) {
      this.pendingDiffData.delete(toolUseId);
    }

    return data;
  }

  clearDiffState(): void {
    this.originalContents.clear();
    this.pendingDiffData.clear();
  }

  getAskUserQuestionAnswers(toolUseId: string): Record<string, string | string[]> | undefined {
    const answers = this.askUserQuestionAnswers.get(toolUseId);
    if (answers) {
      this.askUserQuestionAnswers.delete(toolUseId);
    }
    return answers;
  }

  setApprovedPlanContent(content: string | null): void {
    this.approvedPlanContent = content;
  }

  getApprovedPlanContent(): string | null {
    return this.approvedPlanContent;
  }

  clearApprovedPlanContent(): void {
    this.approvedPlanContent = null;
  }

  setCurrentPlanFilePath(planPath: string | null): void {
    this.currentPlanFilePath = planPath;
  }

  getCurrentPlanFilePath(): string | null {
    return this.currentPlanFilePath;
  }
}

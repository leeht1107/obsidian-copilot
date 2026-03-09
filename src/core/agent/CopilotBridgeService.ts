import { randomUUID } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type ObsidianCopilotPlugin from '../../main';
import { stripCurrentNotePrefix } from '../../utils/context';
import { findCopilotCLIPath } from '../../utils/copilotCli';
import { getEnhancedPath, parseEnvironmentVariables } from '../../utils/env';
import { buildContextFromHistory, getLastUserMessage } from '../../utils/session';
import type { McpServerManager } from '../mcp';
import { buildSystemPrompt } from '../prompts/mainAgent';
import type {
  AskUserQuestionCallback,
  ChatMessage,
  ImageAttachment,
  StreamChunk,
  ToolDiffData,
} from '../types';
import type { ExitPlanModeDecision } from '../types';

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

const DEFAULT_EXCLUDED_TOOLS = ['shell', 'write', 'read', 'url', 'memory'] as const;
const MCP_CONFIG_RELATIVE_PATH = '.copilot/mcp.json';

export class CopilotBridgeService {
  private plugin: ObsidianCopilotPlugin;
  private mcpManager: McpServerManager;
  private currentProcess: ChildProcess | null = null;
  private abortController: AbortController | null = null;
  private sessionId: string | null = null;
  private wasInterrupted = false;
  private cachedCopilotPath: string | null | undefined = undefined;

  private approvalCallback: ApprovalCallback | null = null;
  private askUserQuestionCallback: AskUserQuestionCallback | null = null;
  private exitPlanModeCallback: ExitPlanModeCallback | null = null;
  private enterPlanModeCallback: EnterPlanModeCallback | null = null;
  private currentPlanFilePath: string | null = null;
  private approvedPlanContent: string | null = null;
  private askUserQuestionAnswers = new Map<string, Record<string, string | string[]>>();

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

  private addMcpArgs(args: string[], cwd: string, queryOptions?: QueryOptions): void {
    const allServers = this.mcpManager.getServers();
    if (allServers.length === 0) {
      return;
    }

    const configPath = path.join(cwd, MCP_CONFIG_RELATIVE_PATH);
    if (!fs.existsSync(configPath)) {
      return;
    }

    args.push('--additional-mcp-config', `@${configPath}`);

    const mentionedServers = queryOptions?.mcpMentions ?? new Set<string>();
    const enabledServers = queryOptions?.enabledMcpServers ?? new Set<string>();
    const activeServerNames = new Set([
      ...Object.keys(this.mcpManager.getActiveServers(new Set([...mentionedServers, ...enabledServers]))),
      ...enabledServers,
    ]);

    for (const server of allServers) {
      if (!activeServerNames.has(server.name)) {
        args.push('--disable-mcp-server', server.name);
        continue;
      }

      for (const toolName of server.disabledTools ?? []) {
        const normalizedTool = toolName.trim();
        if (normalizedTool) {
          args.push('--deny-tool', `${server.name}(${normalizedTool})`);
        }
      }
    }
  }

  private addToolArgs(args: string[], queryOptions?: QueryOptions): void {
    const requestedTools = queryOptions?.allowedTools?.map((tool) => tool.trim()).filter(Boolean) ?? [];
    if (requestedTools.length > 0) {
      args.push('--available-tools', ...requestedTools);
      return;
    }

    args.push('--excluded-tools', ...DEFAULT_EXCLUDED_TOOLS);
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
    const fullPrompt = this.buildPromptWithHistory(prompt, conversationHistory, cwd, queryOptions);
    const sessionId = this.ensureSessionId();
    const args = [
      '--no-ask-user',
      '--no-custom-instructions',
      '--output-format',
      'text',
      '--no-color',
      '--resume',
      sessionId,
      '-p',
      fullPrompt,
      '-s',
      '--stream',
      'on',
    ];

    const selectedModel = queryOptions?.model?.trim();
    if (selectedModel && selectedModel !== 'auto') {
      args.push('--model', selectedModel);
    }

    this.addToolArgs(args, queryOptions);
    this.addMcpArgs(args, cwd, queryOptions);

    this.abortController = new AbortController();

    try {
      yield* this.spawnCopilot(copilotPath, args, this.getCustomEnv(copilotPath));
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

    let stderrBuffer = '';
    const chunks: StreamChunk[] = [];
    let resolveWait: (() => void) | null = null;
    let done = false;

    child.stdout?.on('data', (data: Buffer) => {
      chunks.push({ type: 'text', content: data.toString() });
      resolveWait?.();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
    });

    child.on('close', (code) => {
      done = true;
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

  setExitPlanModeCallback(callback: ExitPlanModeCallback | null): void {
    this.exitPlanModeCallback = callback;
  }

  setEnterPlanModeCallback(callback: EnterPlanModeCallback | null): void {
    this.enterPlanModeCallback = callback;
  }

  getDiffData(_toolUseId: string): ToolDiffData | undefined {
    return undefined;
  }

  clearDiffState(): void {
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

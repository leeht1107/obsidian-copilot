/**
 * CopilotBridgeService - GitHub Copilot CLI wrapper
 *
 * Handles communication with GitHub Copilot via CLI spawn.
 * Manages streaming, history, and context injection.
 */

import { spawn, type ChildProcess } from 'child_process';

import type ObsidianCopilotPlugin from '../../main';
import type { ChatMessage, StreamChunk } from '../types';
import { findCopilotCLIPath } from '../../utils/copilotCli';
import { getEnhancedPath } from '../../utils/env';

/** Options for query execution. */
export interface QueryOptions {
  model?: string;
}

/** Message format for history context. */
interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Truncates content to max characters with ellipsis.
 */
function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.substring(0, maxChars) + '\n... [truncated]';
}

/**
 * Builds context string from conversation history.
 * Limits to last N turns to avoid token overflow.
 */
function buildHistoryContext(history: ChatMessage[], maxTurns = 4): string {
  if (!history || history.length === 0) return '';

  // Get last N user-assistant pairs
  const recentHistory: HistoryMessage[] = [];
  let turnCount = 0;

  for (let i = history.length - 1; i >= 0 && turnCount < maxTurns; i--) {
    const msg = history[i];
    if (msg.role === 'user' || msg.role === 'assistant') {
      recentHistory.unshift({
        role: msg.role,
        content: truncateContent(msg.content, 1000),
      });
      if (msg.role === 'assistant') turnCount++;
    }
  }

  if (recentHistory.length === 0) return '';

  const lines = recentHistory.map(
    (m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  );

  return `Previous conversation:\n${lines.join('\n\n')}\n\n---\n\n`;
}

/**
 * Service for interacting with GitHub Copilot CLI.
 */
export class CopilotBridgeService {
  private plugin: ObsidianCopilotPlugin;
  private currentProcess: ChildProcess | null = null;
  private sessionId: string | null = null;
  private cachedCopilotPath: string | null | undefined = undefined; // undefined = not yet resolved
  private cachedEnhancedPath: string | undefined = undefined;

  constructor(plugin: ObsidianCopilotPlugin) {
    this.plugin = plugin;
  }

  /**
   * Resolves the Copilot CLI path (cached after first call).
   */
  private getCopilotPath(): string | null {
    const settingsPath = this.plugin.settings.copilotCliPath?.trim();
    if (settingsPath) return settingsPath;

    if (this.cachedCopilotPath === undefined) {
      this.cachedCopilotPath = findCopilotCLIPath();
    }
    return this.cachedCopilotPath;
  }

  /**
   * Returns enhanced PATH string (cached after first call).
   */
  private getSpawnPath(copilotPath: string): string {
    if (this.cachedEnhancedPath === undefined) {
      this.cachedEnhancedPath = getEnhancedPath(undefined, copilotPath);
    }
    return this.cachedEnhancedPath;
  }

  /**
   * Builds the full prompt with history context.
   */
  private buildFullPrompt(
    prompt: string,
    conversationHistory?: ChatMessage[]
  ): string {
    const historyContext = buildHistoryContext(conversationHistory || []);
    return historyContext + prompt;
  }

  /**
   * Sends a query to Copilot and streams the response.
   */
  async *query(
    prompt: string,
    _images?: unknown[], // Images not supported yet
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

    const fullPrompt = this.buildFullPrompt(prompt, conversationHistory);

    // Build CLI arguments
    const args = [
      '--no-ask-user',
      '--disable-builtin-mcps',
      '--no-custom-instructions',
      '--excluded-tools',
      'shell',
      'write',
      'read',
      'url',
      'memory',
      '--output-format',
      'text',
      '--no-color',
      '-p', // Prompt mode (non-interactive)
      fullPrompt,
      '-s', // Silent mode (no stats)
      '--stream',
      'on', // Enable streaming
    ];

    const selectedModel = queryOptions?.model?.trim();
    if (selectedModel && selectedModel !== 'auto') {
      args.push('--model', selectedModel);
    }

    // Build env with enhanced PATH (Obsidian has minimal PATH; node must be findable)
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: this.getSpawnPath(copilotPath) };
    if (this.plugin.settings.githubToken) {
      env.COPILOT_GITHUB_TOKEN = this.plugin.settings.githubToken;
      env.GH_TOKEN = this.plugin.settings.githubToken;
      env.GITHUB_TOKEN = this.plugin.settings.githubToken;
    }

    try {
      yield* this.spawnCopilot(copilotPath, args, env);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    }
  }

  /**
   * Spawns Copilot CLI and yields stream chunks.
   */
  private async *spawnCopilot(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv
  ): AsyncGenerator<StreamChunk> {
    const cwd = this.getWorkingDirectory();

    // Spawn the process
    const process = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    this.currentProcess = process;

    let stdoutBuffer = '';
    let stderrBuffer = '';

    // Create promise-based event handling
    const chunks: StreamChunk[] = [];
    let resolveWait: (() => void) | null = null;
    let done = false;

    process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdoutBuffer += text;

      // Emit text chunks as they arrive
      chunks.push({ type: 'text', content: text });
      resolveWait?.();
    });

    process.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
    });

    process.on('close', (code) => {
      done = true;
      if (code !== 0 && stderrBuffer) {
        // Check for auth error
        if (stderrBuffer.includes('No authentication information found')) {
          chunks.push({
            type: 'error',
            content:
              'GitHub Copilot authentication required. Please run "copilot" in terminal and use /login to authenticate.',
          });
        } else {
          chunks.push({
            type: 'error',
            content: stderrBuffer.trim(),
          });
        }
      }
      resolveWait?.();
    });

    process.on('error', (err) => {
      done = true;
      chunks.push({
        type: 'error',
        content: `Failed to start Copilot CLI: ${err.message}`,
      });
      resolveWait?.();
    });

    // Yield chunks as they arrive
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        // Wait for more data
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
    }

    this.currentProcess = null;
    yield { type: 'done' };
  }

  /**
   * Gets the working directory (vault path).
   */
  private getWorkingDirectory(): string {
    const adapter = this.plugin.app.vault.adapter;
    if ('basePath' in adapter && typeof adapter.basePath === 'string') {
      return adapter.basePath;
    }
    return process.cwd();
  }

  /**
   * Cancels the current query.
   */
  cancel(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  /**
   * Resets the session (clears history context for next query).
   */
  resetSession(): void {
    this.sessionId = null;
  }

  /**
   * Gets the current session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Sets the session ID.
   */
  setSessionId(id: string | null): void {
    this.sessionId = id;
  }

  /**
   * Cleanup resources.
   */
  cleanup(): void {
    this.cancel();
    this.resetSession();
  }

  /**
   * Simple streaming query - yields text chunks only.
   * Used by auxiliary services (InlineEdit, TitleGeneration, etc.)
   */
  async *streamQuery(prompt: string): AsyncGenerator<string> {
    for await (const chunk of this.query(prompt)) {
      if (chunk.type === 'text') {
        yield chunk.content;
      } else if (chunk.type === 'error') {
        throw new Error(chunk.content);
      }
    }
  }

  /** Stub methods for API compatibility with ObsidianCodeService */
  setApprovalCallback(_callback: unknown): void { /* no-op */ }
  setAskUserQuestionCallback(_callback: unknown): void { /* no-op */ }
  setExitPlanModeCallback(_callback: unknown): void { /* no-op */ }
  setEnterPlanModeCallback(_callback: unknown): void { /* no-op */ }
  getDiffData(_toolUseId: string): undefined { return undefined; }
  clearDiffState(): void { /* no-op */ }
  getAskUserQuestionAnswers(_toolUseId: string): undefined { return undefined; }
  setApprovedPlanContent(_content: string | null): void { /* no-op */ }
  getApprovedPlanContent(): null { return null; }
  clearApprovedPlanContent(): void { /* no-op */ }
  setCurrentPlanFilePath(_path: string | null): void { /* no-op */ }
  getCurrentPlanFilePath(): null { return null; }
  async reloadMcpServers(): Promise<void> { /* no-op - MCP not supported */ }
}

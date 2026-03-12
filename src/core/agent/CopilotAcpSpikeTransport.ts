import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { Readable, Writable } from 'stream';

import type { StreamChunk, UsageInfo } from '../types';
import type { CopilotMcpServer, McpServerConfig } from '../types';

type ApprovalDecision = 'allow' | 'allow-always' | 'deny' | 'cancel';

type AcpClientSideConnection = {
  initialize(params: Record<string, unknown>): Promise<unknown>;
  newSession(params: Record<string, unknown>): Promise<{ sessionId: string }>;
  prompt(params: Record<string, unknown>): Promise<unknown>;
  closed: Promise<void>;
};

type AcpModule = {
  PROTOCOL_VERSION: number;
  ndJsonStream(output: WritableStream<Uint8Array>, input: ReadableStream<Uint8Array>): unknown;
  ClientSideConnection: new (
    toClient: () => {
      requestPermission(params: unknown): Promise<{ outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string } }>;
      sessionUpdate(params: { sessionId: string; update: AcpSessionUpdate }): Promise<void>;
    },
    stream: unknown
  ) => AcpClientSideConnection;
};

type AcpContentBlock = {
  type: string;
  text?: string;
};

type AcpUsageUpdate = {
  size: number;
  used: number;
};

type AcpSessionUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | ({ sessionUpdate: 'usage_update' } & AcpUsageUpdate)
  | { sessionUpdate: string; [key: string]: unknown };

type AcpPermissionRequest = {
  toolCall: {
    title?: string;
    rawInput?: unknown;
  };
  options: Array<{
    optionId: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
    name: string;
  }>;
};

type AcpMcpServer =
  | { type: 'stdio'; name: string; command: string; args: string[]; env: Array<{ name: string; value: string }> }
  | { type: 'sse'; name: string; url: string; headers: Array<{ name: string; value: string }> }
  | { type: 'http'; name: string; url: string; headers: Array<{ name: string; value: string }> };

type AcpStreamState = {
  queue: StreamChunk[];
  waiting: (() => void) | null;
};

function pushChunk(state: AcpStreamState, chunk: StreamChunk): void {
  state.queue.push(chunk);
  state.waiting?.();
}

function toUsageInfo(update: AcpUsageUpdate): UsageInfo {
  const contextWindow = update.size;
  const contextTokens = update.used;
  const percentage = contextWindow > 0 ? Math.max(0, Math.min(100, Math.round((contextTokens / contextWindow) * 100))) : 0;
  return {
    inputTokens: contextTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    contextWindow,
    contextTokens,
    percentage,
  };
}

function promptBlocksFromText(prompt: string): AcpContentBlock[] {
  return [{ type: 'text', text: prompt }];
}

async function loadAcpSdk(): Promise<AcpModule> {
  return (await import('@agentclientprotocol/sdk')) as unknown as AcpModule;
}

function isTextContent(content: unknown): content is AcpContentBlock {
  return !!content && typeof content === 'object' && 'type' in content && (content as { type?: unknown }).type === 'text';
}

function isUsageUpdate(update: AcpSessionUpdate): update is { sessionUpdate: 'usage_update' } & AcpUsageUpdate {
  return update.sessionUpdate === 'usage_update' && typeof update.size === 'number' && typeof update.used === 'number';
}

function toAcpMcpServer(server: CopilotMcpServer): AcpMcpServer | null {
  const config = server.config as McpServerConfig;
  if ('command' in config) {
    return {
      type: 'stdio',
      name: server.name,
      command: config.command,
      args: config.args ?? [],
      env: Object.entries(config.env ?? {}).map(([name, value]) => ({ name, value })),
    };
  }

  if (config.type === 'sse') {
    return {
      type: 'sse',
      name: server.name,
      url: config.url,
      headers: Object.entries(config.headers ?? {}).map(([name, value]) => ({ name, value })),
    };
  }

  if ('url' in config) {
    return {
      type: 'http',
      name: server.name,
      url: config.url,
      headers: Object.entries(config.headers ?? {}).map(([name, value]) => ({ name, value })),
    };
  }

  return null;
}

async function resolvePermissionOutcome(
  params: AcpPermissionRequest,
  onApprovalRequest?: (toolName: string, input: Record<string, unknown>, description: string) => Promise<ApprovalDecision>
): Promise<{ outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string } }> {
  if (!onApprovalRequest) {
    return { outcome: { outcome: 'cancelled' as const } };
  }

  const toolName = params.toolCall.title ?? 'tool';
  const input = params.toolCall.rawInput && typeof params.toolCall.rawInput === 'object' && !Array.isArray(params.toolCall.rawInput)
    ? params.toolCall.rawInput as Record<string, unknown>
    : {};
  const decision = await onApprovalRequest(toolName, input, toolName);

  const preferredKinds: Record<ApprovalDecision, Array<AcpPermissionRequest['options'][number]['kind']>> = {
    allow: ['allow_once'],
    'allow-always': ['allow_always', 'allow_once'],
    deny: ['reject_once', 'reject_always'],
    cancel: [],
  };

  const selected = preferredKinds[decision]
    .map((kind) => params.options.find((option) => option.kind === kind))
    .find(Boolean);

  if (!selected) {
    return { outcome: { outcome: 'cancelled' as const } };
  }

  return { outcome: { outcome: 'selected' as const, optionId: selected.optionId } };
}

export async function* queryViaCopilotAcp(options: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  prompt: string;
  mcpServers: CopilotMcpServer[];
  onApprovalRequest?: (toolName: string, input: Record<string, unknown>, description: string) => Promise<ApprovalDecision>;
}): AsyncGenerator<StreamChunk> {
  const child = spawn(options.command, ['--acp', '--stdio'], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });

  if (!child.stdin || !child.stdout) {
    child.kill('SIGTERM');
    yield { type: 'error', content: 'Failed to start Copilot ACP transport.' };
    return;
  }

  const output = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
  const acp = await loadAcpSdk();
  const stream = acp.ndJsonStream(output, input);

  const state: AcpStreamState = { queue: [], waiting: null };
  let closed = false;
  let sessionId: string | null = null;
  let stderr = '';

  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });
  child.on('close', () => {
    closed = true;
    state.waiting?.();
  });
  child.on('error', (error) => {
    pushChunk(state, { type: 'error', content: `ACP transport failed: ${error.message}` });
    closed = true;
  });

  const client = {
    async requestPermission(params: AcpPermissionRequest) {
      return resolvePermissionOutcome(params, options.onApprovalRequest);
    },
    async sessionUpdate(params: { sessionId: string; update: AcpSessionUpdate }) {
      const update = params.update;
      switch (update.sessionUpdate) {
        case 'agent_message_chunk':
          if (isTextContent(update.content)) {
            pushChunk(state, { type: 'text', content: update.content.text ?? '' });
          }
          break;
        case 'agent_thought_chunk':
          if (isTextContent(update.content)) {
            pushChunk(state, { type: 'thinking', content: update.content.text ?? '' });
          }
          break;
        case 'usage_update':
          if (isUsageUpdate(update)) {
            pushChunk(state, { type: 'usage', sessionId: params.sessionId, usage: toUsageInfo(update) });
          }
          break;
      }
    },
  };

  const connection = new acp.ClientSideConnection(() => client, stream);

  try {
    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const sessionResult = await connection.newSession({
      cwd: options.cwd,
      mcpServers: options.mcpServers.map(toAcpMcpServer).filter((server): server is AcpMcpServer => !!server),
    });
    sessionId = sessionResult.sessionId;

    const promptPromise = connection.prompt({
      sessionId,
      messageId: randomUUID(),
      prompt: promptBlocksFromText(options.prompt),
    }).then(() => {
      pushChunk(state, { type: 'done' });
      closed = true;
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ACP prompt failed';
      pushChunk(state, { type: 'error', content: message });
      closed = true;
    });

    while (!closed || state.queue.length > 0) {
      if (state.queue.length > 0) {
        const chunk = state.queue.shift();
        if (chunk) {
          yield chunk;
        }
        continue;
      }

      await new Promise<void>((resolve) => {
        state.waiting = resolve;
      });
      state.waiting = null;
    }

    await promptPromise;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ACP transport failed';
    yield { type: 'error', content: stderr.trim() || message };
  } finally {
    try {
      child.stdin.end();
    } catch {}
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await connection.closed.catch(() => undefined);
  }
}

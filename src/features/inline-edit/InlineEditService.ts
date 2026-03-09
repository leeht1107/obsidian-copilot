/**
 * InlineEditService - Inline text editing with Copilot CLI
 *
 * Uses CopilotBridgeService for single-shot text transformations.
 * Simplified from Claude SDK-based implementation.
 */

import { getInlineEditSystemPrompt } from '../../core/prompts/inlineEdit';
import type ObsidianCopilotPlugin from '../../main';
import { prependContextFiles } from '../../utils/context';
import { type CursorContext } from '../../utils/editor';

export type InlineEditMode = 'selection' | 'cursor';

export interface InlineEditSelectionRequest {
  mode: 'selection';
  instruction: string;
  notePath: string;
  selectedText: string;
  startLine?: number;
  lineCount?: number;
  contextFiles?: string[];
}

export interface InlineEditCursorRequest {
  mode: 'cursor';
  instruction: string;
  notePath: string;
  cursorContext: CursorContext;
  contextFiles?: string[];
}

export type InlineEditRequest = InlineEditSelectionRequest | InlineEditCursorRequest;

export interface InlineEditResult {
  success: boolean;
  editedText?: string;
  insertedText?: string;
  clarification?: string;
  error?: string;
}

export class InlineEditService {
  private plugin: ObsidianCopilotPlugin;
  private abortController: AbortController | null = null;

  constructor(plugin: ObsidianCopilotPlugin) {
    this.plugin = plugin;
  }

  resetConversation(): void {
    // No-op for now (stateless)
  }

  async editText(request: InlineEditRequest): Promise<InlineEditResult> {
    const prompt = this.buildPrompt(request);
    return this.sendMessage(prompt);
  }

  async continueConversation(message: string, contextFiles?: string[]): Promise<InlineEditResult> {
    let prompt = message;
    if (contextFiles && contextFiles.length > 0) {
      prompt = prependContextFiles(message, contextFiles);
    }
    return this.sendMessage(prompt);
  }

  private async sendMessage(prompt: string): Promise<InlineEditResult> {
    this.abortController = new AbortController();
    const systemPrompt = getInlineEditSystemPrompt();
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    try {
      let responseText = '';

      for await (const chunk of this.plugin.agentService.streamQuery(fullPrompt)) {
        if (this.abortController?.signal.aborted) {
          return { success: false, error: 'Cancelled' };
        }
        responseText += chunk;
      }

      return this.parseResponse(responseText);
    } catch (error) {
      console.error('[InlineEditService] Error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    } finally {
      this.abortController = null;
    }
  }

  private parseResponse(responseText: string): InlineEditResult {
    const replacementMatch = responseText.match(/<replacement>([\s\S]*?)<\/replacement>/);
    if (replacementMatch) {
      return { success: true, editedText: replacementMatch[1] };
    }

    const insertionMatch = responseText.match(/<insertion>([\s\S]*?)<\/insertion>/);
    if (insertionMatch) {
      return { success: true, insertedText: insertionMatch[1] };
    }

    const trimmed = responseText.trim();
    if (trimmed) {
      return { success: true, clarification: trimmed };
    }

    return { success: false, error: 'Empty response' };
  }

  private buildPrompt(request: InlineEditRequest): string {
    let prompt: string;

    if (request.mode === 'cursor') {
      prompt = this.buildCursorPrompt(request);
    } else {
      const lineAttr = request.startLine && request.lineCount
        ? ` lines="${request.startLine}-${request.startLine + request.lineCount - 1}"`
        : '';
      prompt = [
        `<editor_selection path="${request.notePath}"${lineAttr}>`,
        request.selectedText,
        '</editor_selection>',
        '',
        '<query>',
        request.instruction,
        '</query>',
      ].join('\n');
    }

    if (request.contextFiles && request.contextFiles.length > 0) {
      prompt = prependContextFiles(prompt, request.contextFiles);
    }

    return prompt;
  }

  private buildCursorPrompt(request: InlineEditCursorRequest): string {
    const ctx = request.cursorContext;
    const lineAttr = ` line="${ctx.line + 1}"`;

    let cursorContent: string;
    if (ctx.isInbetween) {
      const parts = [];
      if (ctx.beforeCursor) parts.push(ctx.beforeCursor);
      parts.push('| #inbetween');
      if (ctx.afterCursor) parts.push(ctx.afterCursor);
      cursorContent = parts.join('\n');
    } else {
      cursorContent = `${ctx.beforeCursor}|${ctx.afterCursor} #inline`;
    }

    return [
      `<editor_cursor path="${request.notePath}"${lineAttr}>`,
      cursorContent,
      '</editor_cursor>',
      '',
      '<query>',
      request.instruction,
      '</query>',
    ].join('\n');
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}

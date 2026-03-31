/**
 * TitleGenerationService - Generates conversation titles with Copilot CLI
 *
 * Uses CopilotBridgeService for title generation.
 * Simplified from Claude SDK-based implementation.
 */

import { TITLE_GENERATION_SYSTEM_PROMPT } from '../../../core/prompts/titleGeneration';
import type ObsidianCopilotPlugin from '../../../main';

export type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

export type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult
) => Promise<void>;

export class TitleGenerationService {
  private plugin: ObsidianCopilotPlugin;
  private activeGenerations: Map<string, AbortController> = new Map();

  constructor(plugin: ObsidianCopilotPlugin) {
    this.plugin = plugin;
  }

  async generateTitle(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    callback: TitleGenerationCallback
  ): Promise<void> {
    const existingController = this.activeGenerations.get(conversationId);
    if (existingController) {
      existingController.abort();
    }

    const abortController = new AbortController();
    this.activeGenerations.set(conversationId, abortController);

    const truncatedUser = this.truncateText(userMessage, 500);
    const truncatedAssistant = this.truncateText(assistantResponse, 500);

    const prompt = `${TITLE_GENERATION_SYSTEM_PROMPT}

User's first message:
"""
${truncatedUser}
"""

AI's response:
"""
${truncatedAssistant}
"""

Generate a title for this conversation:`;

    try {
      let responseText = '';
      const titleModel = this.plugin.settings.titleGenerationModel?.trim();

      for await (const chunk of this.plugin.agentService.streamQuery(prompt, {
        disableMcp: true,
        skipResume: true,
        model: titleModel && titleModel !== 'auto' ? titleModel : undefined,
      })) {
        if (abortController.signal.aborted) {
          await this.safeCallback(callback, conversationId, {
            success: false,
            error: 'Cancelled',
          });
          return;
        }
        responseText += chunk;
      }

      const title = this.parseTitle(responseText);
      if (title) {
        await this.safeCallback(callback, conversationId, { success: true, title });
      } else {
        console.warn('[TitleGeneration] Failed to parse title from response');
        await this.safeCallback(callback, conversationId, {
          success: false,
          error: 'Failed to parse title from response',
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      const isConfigError = msg.includes('not configured') || msg.includes('CLI');
      if (error instanceof Error && error.name !== 'AbortError' && !isConfigError) {
        console.error('[TitleGeneration] Error generating title:', error.message);
      }
      await this.safeCallback(callback, conversationId, { success: false, error: msg });
    } finally {
      this.activeGenerations.delete(conversationId);
    }
  }

  cancel(): void {
    for (const controller of this.activeGenerations.values()) {
      controller.abort();
    }
    this.activeGenerations.clear();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private parseTitle(responseText: string): string | null {
    const trimmed = responseText.trim();
    if (!trimmed) return null;

    let title = trimmed;
    if (
      (title.startsWith('"') && title.endsWith('"')) ||
      (title.startsWith("'") && title.endsWith("'"))
    ) {
      title = title.slice(1, -1);
    }

    title = title.replace(/[.!?:;,]+$/, '');

    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }

    return title || null;
  }

  private async safeCallback(
    callback: TitleGenerationCallback,
    conversationId: string,
    result: TitleGenerationResult
  ): Promise<void> {
    try {
      await callback(conversationId, result);
    } catch (error) {
      console.error('[TitleGeneration] Error in callback:', error instanceof Error ? error.message : error);
    }
  }
}

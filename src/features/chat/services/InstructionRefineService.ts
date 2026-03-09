/**
 * InstructionRefineService - Refines user instructions with Copilot CLI
 *
 * Uses CopilotBridgeService for instruction refinement.
 * Simplified from Claude SDK-based implementation.
 */

import { buildRefineSystemPrompt } from '../../../core/prompts/instructionRefine';
import type { InstructionRefineResult } from '../../../core/types';
import type ObsidianCopilotPlugin from '../../../main';

export type RefineProgressCallback = (update: InstructionRefineResult) => void;

export class InstructionRefineService {
  private plugin: ObsidianCopilotPlugin;
  private abortController: AbortController | null = null;
  private existingInstructions: string = '';

  constructor(plugin: ObsidianCopilotPlugin) {
    this.plugin = plugin;
  }

  resetConversation(): void {
    // No-op for now (stateless)
  }

  async refineInstruction(
    rawInstruction: string,
    existingInstructions: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult> {
    this.existingInstructions = existingInstructions;
    const prompt = `Please refine this instruction: "${rawInstruction}"`;
    return this.sendMessage(prompt, onProgress);
  }

  async continueConversation(
    message: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult> {
    return this.sendMessage(message, onProgress);
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async sendMessage(
    prompt: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult> {
    this.abortController = new AbortController();
    const systemPrompt = buildRefineSystemPrompt(this.existingInstructions);
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    try {
      let responseText = '';

      for await (const chunk of this.plugin.agentService.streamQuery(fullPrompt)) {
        if (this.abortController?.signal.aborted) {
          return { success: false, error: 'Cancelled' };
        }
        responseText += chunk;
        if (onProgress) {
          const partialResult = this.parseResponse(responseText);
          onProgress(partialResult);
        }
      }

      return this.parseResponse(responseText);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    } finally {
      this.abortController = null;
    }
  }

  private parseResponse(responseText: string): InstructionRefineResult {
    const instructionMatch = responseText.match(/<instruction>([\s\S]*?)<\/instruction>/);
    if (instructionMatch) {
      return { success: true, refinedInstruction: instructionMatch[1].trim() };
    }

    const trimmed = responseText.trim();
    if (trimmed) {
      return { success: true, clarification: trimmed };
    }

    return { success: false, error: 'Empty response' };
  }
}

import type { CopilotModel } from '@/core/types/models';
import { COPILOT_MODELS, DEFAULT_MODEL, DEFAULT_THINKING_BUDGET } from '@/core/types/models';

describe('models.ts', () => {
  const modelIds = COPILOT_MODELS.map((model) => model.value);

  it('keeps the selectable defaults aligned with Copilot CLI 1.0.59 model IDs', () => {
    expect(modelIds).toEqual([
      'auto',
      'gpt-5-mini',
      'gpt-5.4-mini',
      'gpt-5.2',
      'gpt-5.4',
      'claude-haiku-4.5',
      'claude-sonnet-4.5',
      'claude-sonnet-4.6',
      'gpt-5.2-codex',
      'gpt-5.3-codex',
      'gpt-5.5',
      'claude-opus-4.5',
      'claude-opus-4.6',
      'claude-opus-4.6-fast',
      'claude-opus-4.7',
      'claude-opus-4.8',
    ]);
    expect(DEFAULT_MODEL).toBe('auto');
  });

  it('does not expose retired or local-CLI-unlisted legacy defaults', () => {
    expect(modelIds).not.toEqual(expect.arrayContaining([
      'gpt-4.1',
      'grok-code-fast-1',
      'claude-sonnet-4',
      'gemini-2.5-pro',
      'gpt-5.1',
      'gpt-5.1-codex',
      'gpt-5.1-codex-max',
    ]));
  });

  it('uses AI Credits usage-rate labels instead of multiplier-first labels', () => {
    expect(COPILOT_MODELS.every((model) => model.costLabel.startsWith('AI Credits:'))).toBe(true);
    expect(COPILOT_MODELS.every((model) => !/\b\d+(?:\.\d+)?x\b/.test(model.costLabel))).toBe(true);
  });

  it('keeps neutral source-dated descriptions', () => {
    expect(COPILOT_MODELS.every((model) => model.description.includes('2026-06'))).toBe(true);
  });

  it('enables thinking only for models with current configurable reasoning support', () => {
    const reasoningModelIds = COPILOT_MODELS
      .filter((model) => model.supportsReasoning)
      .map((model) => model.value);

    expect(reasoningModelIds).toEqual([
      'gpt-5.4',
      'claude-sonnet-4.6',
      'gpt-5.3-codex',
      'gpt-5.5',
      'claude-opus-4.6',
      'claude-opus-4.6-fast',
      'claude-opus-4.7',
      'claude-opus-4.8',
    ]);
  });

  it('has a default thinking budget for each selectable default model', () => {
    for (const modelId of modelIds) {
      expect(DEFAULT_THINKING_BUDGET[modelId]).toBe('off');
    }
  });

  it('preserves custom model string support', () => {
    const customModel: CopilotModel = 'openai/custom-routing-model';

    expect(customModel).toBe('openai/custom-routing-model');
  });
});

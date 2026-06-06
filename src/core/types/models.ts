export type CopilotModel = string;

export interface ModelOption {
  value: CopilotModel;
  label: string;
  costLabel: string;
  requiresEnablement: boolean;
  description: string;
  supportsReasoning: boolean;
}

export type ThinkingBudget = 'off' | 'low' | 'medium' | 'high';

export const THINKING_BUDGETS = [
  { value: 'off', label: 'off', cliValue: null },
  { value: 'low', label: 'low', cliValue: 'low' },
  { value: 'medium', label: 'med', cliValue: 'medium' },
  { value: 'high', label: 'high', cliValue: 'high' },
] as const;

export const DEFAULT_THINKING_BUDGET: Record<string, ThinkingBudget> = {
  auto: 'off',
  'gpt-5-mini': 'off',
  'gpt-5.2': 'off',
  'gpt-5.2-codex': 'off',
  'gpt-5.3-codex': 'off',
  'gpt-5.4': 'off',
  'gpt-5.4-mini': 'off',
  'gpt-5.5': 'off',
  'claude-haiku-4.5': 'off',
  'claude-sonnet-4.5': 'off',
  'claude-sonnet-4.6': 'off',
  'claude-opus-4.5': 'off',
  'claude-opus-4.6': 'off',
  'claude-opus-4.6-fast': 'off',
  'claude-opus-4.7': 'off',
  'claude-opus-4.8': 'off',
};

export const COPILOT_MODELS: ModelOption[] = [
  { value: 'auto', label: 'auto', costLabel: 'AI Credits: auto', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: Copilot chooses from models available to your plan and client.' },

  { value: 'gpt-5-mini', label: 'gpt-5 mini', costLabel: 'AI Credits: lightweight', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: GA lightweight OpenAI model; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'gpt-5.4-mini', label: 'gpt-5.4 mini', costLabel: 'AI Credits: lightweight', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: GA lightweight OpenAI model; Copilot CLI 1.0.59 exposes this model ID.' },

  { value: 'gpt-5.2', label: 'gpt-5.2', costLabel: 'AI Credits: versatile', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: supported-models page lists this OpenAI model as closing down; Copilot CLI 1.0.59 still exposes this model ID.' },
  { value: 'gpt-5.4', label: 'gpt-5.4', costLabel: 'AI Credits: versatile', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA versatile OpenAI model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },

  { value: 'claude-haiku-4.5', label: 'claude haiku 4.5', costLabel: 'AI Credits: versatile', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: GA versatile Anthropic model; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-sonnet-4.5', label: 'claude sonnet 4.5', costLabel: 'AI Credits: versatile', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: GA versatile Anthropic model; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-sonnet-4.6', label: 'claude sonnet 4.6', costLabel: 'AI Credits: versatile', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA versatile Anthropic model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },

  { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: supported-models page lists this OpenAI Codex model as closing down; Copilot CLI 1.0.59 still exposes this model ID.' },
  { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA powerful OpenAI Codex model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'gpt-5.5', label: 'gpt-5.5', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA powerful OpenAI model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-opus-4.5', label: 'claude opus 4.5', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: false, description: 'GitHub Docs 2026-06: GA powerful Anthropic model; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-opus-4.6', label: 'claude opus 4.6', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA powerful Anthropic model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-opus-4.6-fast', label: 'claude opus 4.6 fast', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: public-preview fast mode for Claude Opus 4.6 with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-opus-4.7', label: 'claude opus 4.7', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA powerful Anthropic model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },
  { value: 'claude-opus-4.8', label: 'claude opus 4.8', costLabel: 'AI Credits: powerful', requiresEnablement: false, supportsReasoning: true, description: 'GitHub Docs 2026-06: GA powerful Anthropic model with configurable reasoning; Copilot CLI 1.0.59 exposes this model ID.' },
];

export const DEFAULT_MODEL = 'auto';

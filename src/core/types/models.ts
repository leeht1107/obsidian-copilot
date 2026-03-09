export type CopilotModel = string;

export type ClaudeModel = CopilotModel;

export interface ModelOption {
  value: CopilotModel;
  label: string;
  costLabel: string;
  requiresEnablement: boolean;
  description: string;
}

export type ThinkingBudget = 'off';

export const THINKING_BUDGETS = [
  { value: 'off', label: 'Standard', tokens: 0 },
] as const;

export const DEFAULT_THINKING_BUDGET: Record<string, ThinkingBudget> = {
  auto: 'off',
};

export const COPILOT_MODELS: ModelOption[] = [
  { value: 'auto', label: 'Auto', costLabel: 'best', requiresEnablement: false, description: 'Let Copilot choose the best model for the task.' },

  { value: 'gpt-4.1', label: 'GPT-4.1', costLabel: '0x', requiresEnablement: false, description: 'Stable general-purpose model.' },
  { value: 'gpt-4o', label: 'GPT-4o', costLabel: '0x', requiresEnablement: false, description: 'Fast multimodal general-purpose model.' },
  { value: 'gpt-5-mini', label: 'GPT-5 mini', costLabel: '0x', requiresEnablement: false, description: 'Fast default for coding and writing.' },
  { value: 'raptor-mini', label: 'Raptor mini (Preview)', costLabel: '0x', requiresEnablement: false, description: 'Fast preview model for lightweight coding tasks.' },

  { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', costLabel: '0.33x', requiresEnablement: false, description: 'Low-cost Claude model for quick tasks.' },
  { value: 'gemini-3-flash', label: 'Gemini 3 Flash (Preview)', costLabel: '0.33x', requiresEnablement: false, description: 'Fast Gemini preview model.' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini (Preview)', costLabel: '0.33x', requiresEnablement: true, description: 'Preview codex mini model.' },

  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4', costLabel: '1x', requiresEnablement: true, description: 'Solid general-purpose Claude model.' },
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', costLabel: '1x', requiresEnablement: false, description: 'Reliable coding model.' },
  { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', costLabel: '1x', requiresEnablement: false, description: 'Latest general-availability Sonnet model.' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', costLabel: '1x', requiresEnablement: false, description: 'Gemini model for stronger reasoning.' },
  { value: 'gemini-3-pro', label: 'Gemini 3 Pro (Preview)', costLabel: '1x', requiresEnablement: false, description: 'Preview Gemini Pro model.' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (Preview)', costLabel: '1x', requiresEnablement: false, description: 'Latest preview Gemini Pro model.' },
  { value: 'gpt-5.1', label: 'GPT-5.1', costLabel: '1x', requiresEnablement: true, description: 'High-quality GPT-5.1 model.' },
  { value: 'gpt-5.1-codex', label: 'GPT-5.1-Codex', costLabel: '1x', requiresEnablement: true, description: 'Codex-tuned GPT-5.1 model.' },
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max', costLabel: '1x', requiresEnablement: true, description: 'Higher-end codex model.' },
  { value: 'gpt-5.2', label: 'GPT-5.2', costLabel: '1x', requiresEnablement: false, description: 'Latest generally available GPT model.' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', costLabel: '1x', requiresEnablement: false, description: 'Recommended for complex engineering tasks.' },
  { value: 'gpt-5.4', label: 'GPT-5.4', costLabel: '1x', requiresEnablement: false, description: 'Newest high-end GPT model in Copilot.' },

  { value: 'claude-opus-4.5', label: 'Claude Opus 4.5', costLabel: '3x', requiresEnablement: false, description: 'Premium Claude model.' },
  { value: 'claude-opus-4.6', label: 'Claude Opus 4.6', costLabel: '3x', requiresEnablement: false, description: 'Premium latest Opus model.' },
];

export const DEFAULT_MODEL = 'auto';

export const DEFAULT_CLAUDE_MODELS = COPILOT_MODELS;

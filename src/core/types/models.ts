export type CopilotModel = string;

export interface ModelOption {
  value: CopilotModel;
  label: string;
  costLabel: string;
  requiresEnablement: boolean;
  description: string;
}

export type ThinkingBudget = 'off' | 'low' | 'medium' | 'high' | 'xhigh';

export const THINKING_BUDGETS = [
  { value: 'off', label: 'off', cliValue: null },
  { value: 'low', label: 'low', cliValue: 'low' },
  { value: 'medium', label: 'med', cliValue: 'medium' },
  { value: 'high', label: 'high', cliValue: 'high' },
  { value: 'xhigh', label: 'max', cliValue: 'xhigh' },
] as const;

export const DEFAULT_THINKING_BUDGET: Record<string, ThinkingBudget> = {
  auto: 'off',
  'gpt-4.1': 'off',
  'gpt-5-mini': 'high',
  'gpt-5.4-mini': 'off',
  'claude-haiku-4.5': 'off',
  'grok-code-fast-1': 'off',
  'claude-sonnet-4': 'high',
  'claude-sonnet-4.5': 'high',
  'claude-sonnet-4.6': 'high',
  'gemini-2.5-pro': 'high',
  'gpt-5.1': 'high',
  'gpt-5.1-codex': 'high',
  'gpt-5.1-codex-max': 'high',
  'gpt-5.2': 'high',
  'gpt-5.2-codex': 'high',
  'gpt-5.3-codex': 'high',
  'gpt-5.4': 'high',
  'claude-opus-4.5': 'high',
  'claude-opus-4.6': 'high',
};

export const COPILOT_MODELS: ModelOption[] = [
  { value: 'auto', label: 'auto', costLabel: 'best', requiresEnablement: false, description: 'Let Copilot choose the best model for the task.' },

  { value: 'gpt-4.1', label: 'gpt-4.1', costLabel: '0x', requiresEnablement: false, description: 'Stable general-purpose model.' },
  { value: 'gpt-5-mini', label: 'gpt-5 mini', costLabel: '0x', requiresEnablement: false, description: 'Fast default for coding and writing.' },
  { value: 'gpt-5.4-mini', label: 'gpt-5.4 mini', costLabel: '0x', requiresEnablement: false, description: 'Fast lightweight model.' },

  { value: 'claude-haiku-4.5', label: 'claude haiku 4.5', costLabel: '0.33x', requiresEnablement: false, description: 'Low-cost Claude model for quick tasks.' },
  { value: 'grok-code-fast-1', label: 'grok code fast 1', costLabel: '0.33x', requiresEnablement: false, description: 'Fast coding model from xAI.' },

  { value: 'claude-sonnet-4', label: 'claude sonnet 4', costLabel: '1x', requiresEnablement: false, description: 'Solid general-purpose Claude model.' },
  { value: 'claude-sonnet-4.5', label: 'claude sonnet 4.5', costLabel: '1x', requiresEnablement: false, description: 'Reliable coding model.' },
  { value: 'claude-sonnet-4.6', label: 'claude sonnet 4.6', costLabel: '1x', requiresEnablement: false, description: 'Latest general-availability Sonnet model.' },
  { value: 'gemini-2.5-pro', label: 'gemini 2.5 pro', costLabel: '1x', requiresEnablement: false, description: 'Gemini model for stronger reasoning.' },
  { value: 'gpt-5.1', label: 'gpt-5.1', costLabel: '1x', requiresEnablement: false, description: 'High-quality GPT-5.1 model.' },
  { value: 'gpt-5.1-codex', label: 'gpt-5.1-codex', costLabel: '1x', requiresEnablement: false, description: 'Codex-tuned GPT-5.1 model.' },
  { value: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max', costLabel: '1x', requiresEnablement: false, description: 'Higher-end codex model.' },
  { value: 'gpt-5.2', label: 'gpt-5.2', costLabel: '1x', requiresEnablement: false, description: 'Latest generally available GPT model.' },
  { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex', costLabel: '1x', requiresEnablement: false, description: 'Codex-tuned GPT-5.2 model.' },
  { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex', costLabel: '1x', requiresEnablement: false, description: 'Recommended for complex engineering tasks.' },
  { value: 'gpt-5.4', label: 'gpt-5.4', costLabel: '1x', requiresEnablement: false, description: 'Newest high-end GPT model in Copilot.' },

  { value: 'claude-opus-4.5', label: 'claude opus 4.5', costLabel: '3x', requiresEnablement: false, description: 'Premium Claude model.' },
  { value: 'claude-opus-4.6', label: 'claude opus 4.6', costLabel: '3x', requiresEnablement: false, description: 'Premium latest Opus model.' },
];

export const DEFAULT_MODEL = 'auto';

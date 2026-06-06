/**
 * Obsidian Code - Type definitions barrel export.
 *
 * Re-exports all types from modular type files.
 */

// Chat types
export {
  type ChatMessage,
  type ContentBlock,
  type Conversation,
  type ConversationMeta,
  type ImageAttachment,
  type ImageMediaType,
  type QuizQuestionMeta,
  type QuizQuestionOption,
  type QuizSessionState,
  type SocraticSessionState,
  type SocraticTurnMeta,
  type StreamChunk,
  type UsageInfo,
  VIEW_TYPE_OBSIDIAN_COPILOT,
} from './chat';

// Model types
export {
  COPILOT_MODELS,
  type CopilotModel,
  DEFAULT_MODEL,
  DEFAULT_THINKING_BUDGET,
  THINKING_BUDGETS,
  type ThinkingBudget,
} from './models';

// Settings types
export {
  DEFAULT_SETTINGS,
  type EnvSnippet,
  getBashToolBlockedCommands,
  getCurrentPlatformBlockedCommands,
  getCurrentPlatformKey,
  getDefaultBlockedCommands,
  type InstructionRefineResult,
  type KeyboardNavigationSettings,
  type NonPlanPermissionMode,
  type ObsidianCopilotSettings,
  type Permission,
  type PermissionMode,
  type PlatformBlockedCommands,
  type SlashCommand,
} from './settings';

// Tool types
export {
  type AsyncSubagentStatus,
  type ExitPlanModeDecision,
  type SubagentInfo,
  type SubagentMode,
  type ToolCallInfo,
  type ToolDiffData,
} from './tools';

// MCP types
export {
  type CopilotMcpConfigFile,
  type CopilotMcpServer,
  DEFAULT_MCP_SERVER,
  getMcpServerType,
  isValidMcpServerConfig,
  type McpHttpServerConfig,
  type McpServerConfig,
  type McpServerType,
  type McpSSEServerConfig,
  type McpStdioServerConfig,
  type ParsedMcpConfig,
} from './mcp';

// AskUserQuestion types
export {
  type AskUserQuestionCallback,
  type AskUserQuestionInput,
  type AskUserQuestionOption,
  type AskUserQuestionQuestion,
} from './askUserQuestion';

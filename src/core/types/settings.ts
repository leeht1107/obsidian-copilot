/**
 * Settings type definitions.
 */

import { type CopilotModel, DEFAULT_MODEL, type ThinkingBudget } from './models';

/** Platform-specific blocked commands (Unix). */
const UNIX_BLOCKED_COMMANDS = [
  '\\brm\\s+-rf\\b',
  '\\brm\\s+-fr\\b',
  '\\bchmod\\s+777\\b',
  '\\bchmod\\s+-R\\s+777\\b',
  '\\bmkfs\\b',
  '\\bdd\\s+if=',
  '\\bcurl\\b.*\\|.*\\bsh\\b',
  '\\bwget\\b.*\\|.*\\bsh\\b',
];

/** Platform-specific blocked commands (Windows - both CMD and PowerShell). */
const WINDOWS_BLOCKED_COMMANDS = [
  // CMD commands
  'del /s /q',
  'rd /s /q',
  'rmdir /s /q',
  'format',
  'diskpart',
  // PowerShell Remove-Item variants (full and abbreviated flags)
  'Remove-Item -Recurse -Force',
  'Remove-Item -Force -Recurse',
  'Remove-Item -r -fo',
  'Remove-Item -fo -r',
  'Remove-Item -Recurse',
  'Remove-Item -r',
  // PowerShell aliases for Remove-Item
  'ri -Recurse',
  'ri -r',
  'ri -Force',
  'ri -fo',
  'rm -r -fo',
  'rm -Recurse',
  'rm -Force',
  'del -Recurse',
  'del -Force',
  'erase -Recurse',
  'erase -Force',
  // PowerShell directory removal aliases
  'rd -Recurse',
  'rmdir -Recurse',
  // Dangerous disk/volume commands
  'Format-Volume',
  'Clear-Disk',
  'Initialize-Disk',
  'Remove-Partition',
];

/** Platform-keyed blocked commands structure. */
export interface PlatformBlockedCommands {
  unix: string[];
  windows: string[];
}

/** Get default blocked commands for all platforms. */
export function getDefaultBlockedCommands(): PlatformBlockedCommands {
  return {
    unix: [...UNIX_BLOCKED_COMMANDS],
    windows: [...WINDOWS_BLOCKED_COMMANDS],
  };
}

/** Get the current platform key ('unix' or 'windows'). */
export function getCurrentPlatformKey(): keyof PlatformBlockedCommands {
  return process.platform === 'win32' ? 'windows' : 'unix';
}

/** Get blocked commands for the current platform. */
export function getCurrentPlatformBlockedCommands(commands: PlatformBlockedCommands): string[] {
  return commands[getCurrentPlatformKey()];
}

/**
 * Get blocked commands for the Bash tool.
 *
 * On Windows, the Bash tool runs in a Git Bash/MSYS2 environment but can still
 * invoke Windows commands (e.g., via `cmd /c` or `powershell`), so both Unix
 * and Windows blocklist patterns are merged.
 */
export function getBashToolBlockedCommands(commands: PlatformBlockedCommands): string[] {
  if (process.platform === 'win32') {
    return Array.from(new Set([...commands.unix, ...commands.windows]));
  }
  return getCurrentPlatformBlockedCommands(commands);
}

/** Permission mode for tool execution. */
export type PermissionMode = 'agent' | 'ask' | 'plan';
export type NonPlanPermissionMode = Exclude<PermissionMode, 'plan'>;

/** Permanently approved tool permission (like Claude Code). */
export interface Permission {
  toolName: string;
  pattern: string;
  approvedAt: number;
  scope: 'session' | 'always';
}

/** Saved environment variable configuration. */
export interface EnvSnippet {
  id: string;
  name: string;
  description: string;
  envVars: string;
}

/** Slash command configuration with Claude Code compatibility. */
export interface SlashCommand {
  id: string;
  name: string;                // Command name used after / (e.g., "review-code")
  description?: string;        // Optional description shown in dropdown
  argumentHint?: string;       // Placeholder text for arguments (e.g., "[file] [focus]")
  allowedTools?: string[];     // Restrict tools when command is used
  model?: CopilotModel;         // Override model for this command
  content: string;             // Prompt template with placeholders
}

/** Keyboard navigation settings for vim-style scrolling. */
export interface KeyboardNavigationSettings {
  scrollUpKey: string;         // Key to scroll up when focused on messages (default: 'w')
  scrollDownKey: string;       // Key to scroll down when focused on messages (default: 's')
  focusInputKey: string;       // Key to focus input (default: 'i', like vim insert mode)
}

/** Plugin settings persisted to disk. */
export interface ObsidianCopilotSettings {
  userName: string;
  enableBlocklist: boolean;
  blockedCommands: PlatformBlockedCommands;
  model: CopilotModel;
  enableAutoTitleGeneration: boolean;
  titleGenerationModel: string;  // Model for auto title generation (empty = auto)
  lastEnvHash?: string;
  thinkingBudget: ThinkingBudget;
  permissionMode: PermissionMode;
  lastNonPlanPermissionMode?: NonPlanPermissionMode;
  permissions: Permission[];
  excludedTags: string[];
  mediaFolder: string;
  environmentVariables: string;
  envSnippets: EnvSnippet[];
  systemPrompt: string;
  allowedExportPaths: string[];
  slashCommands: SlashCommand[];
  keyboardNavigation: KeyboardNavigationSettings;
  enableWebSearch: boolean;
  enableInlineBash: boolean;  // Allow !`bash` execution in slash commands (security risk if enabled)
  copilotCliPath: string;  // Custom Copilot CLI path (empty = auto-detect from PATH)
  githubToken: string;  // GitHub token for Copilot authentication (optional, uses stored auth by default)
}

/** Default plugin settings. */
export const DEFAULT_SETTINGS: ObsidianCopilotSettings = {
  userName: '',
  enableBlocklist: true,
  blockedCommands: getDefaultBlockedCommands(),
  model: DEFAULT_MODEL,
  enableAutoTitleGeneration: true,
  titleGenerationModel: '',
  lastEnvHash: '',
  thinkingBudget: 'off',
  permissionMode: 'agent',
  lastNonPlanPermissionMode: 'agent',
  permissions: [],
  excludedTags: [],
  mediaFolder: '',
  environmentVariables: '',
  envSnippets: [],
  systemPrompt: '',
  allowedExportPaths: ['~/Desktop', '~/Downloads'],
  slashCommands: [],
  keyboardNavigation: {
    scrollUpKey: 'w',
    scrollDownKey: 's',
    focusInputKey: 'i',
  },
  enableWebSearch: false,
  enableInlineBash: false,
  copilotCliPath: '',  // Empty = auto-detect from PATH
  githubToken: '',  // Empty = use stored auth
};

/** Result from instruction refinement agent query. */
export interface InstructionRefineResult {
  success: boolean;
  refinedInstruction?: string;  // The refined instruction text
  clarification?: string;       // Agent's clarifying question (if any)
  error?: string;               // Error message (if failed)
}

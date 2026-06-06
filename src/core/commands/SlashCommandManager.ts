/**
 * ObsidianCode - Slash command manager
 *
 * Core logic for parsing and expanding slash commands with Claude Code compatibility.
 * Supports $ARGUMENTS, $1/$2, @file references, and !`bash` execution.
 */

import { exec } from 'child_process';
import type { App } from 'obsidian';
import type { TFile } from 'obsidian';

import { getEnhancedPath } from '../../utils/env';
import { parseSlashCommandContent } from '../../utils/slashCommand';
import type { CopilotModel, SlashCommand } from '../types';

function isVaultFileCandidate(value: unknown): value is TFile {
  return !!value && typeof value === 'object' && 'path' in value;
}

type BashRunner = (command: string, cwd: string) => Promise<string>;

export interface BashExpansionOptions {
  enabled: boolean;
  shouldBlockCommand?: (command: string) => boolean;
  requestApproval?: (command: string) => Promise<boolean>;
}

export interface SlashCommandExpansionOptions {
  bash?: BashExpansionOptions;
}

/** Result of command expansion. */
export interface ExpansionResult {
  expandedPrompt: string;
  allowedTools?: string[];
  model?: CopilotModel;
  errors: string[];
}

/** Result of command detection. */
export interface DetectedCommand {
  commandName: string;
  args: string;
}

/** Manages slash command parsing and expansion. */
export class SlashCommandManager {
  private commands: Map<string, SlashCommand> = new Map();
  private app: App;
  private vaultPath: string;
  private bashRunner: BashRunner;

  constructor(app: App, vaultPath: string, options: { bashRunner?: BashRunner } = {}) {
    this.app = app;
    this.vaultPath = vaultPath;
    this.bashRunner = options.bashRunner ?? defaultBashRunner;
  }

  /** Registers commands from settings. */
  setCommands(commands: SlashCommand[]): void {
    this.commands.clear();
    for (const cmd of commands) {
      this.commands.set(cmd.name.toLowerCase(), cmd);
    }
  }

  /** Gets all registered commands. */
  getCommands(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /** Gets a command by name. */
  getCommand(name: string): SlashCommand | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /** Gets filtered commands matching a prefix. */
  getMatchingCommands(prefix: string): SlashCommand[] {
    const prefixLower = prefix.toLowerCase();
    return this.getCommands()
      .filter(cmd =>
        cmd.name.toLowerCase().includes(prefixLower) ||
        cmd.description?.toLowerCase().includes(prefixLower)
      )
      .slice(0, 10);
  }

  /**
   * Detects if input starts with a slash command.
   * Returns the command name and arguments if found.
   */
  detectCommand(input: string): DetectedCommand | null {
    const trimmed = input.trimStart();
    if (!trimmed.startsWith('/')) return null;

    // Extract command name (everything after / until first whitespace)
    // Allows nested paths like /code/review
    // Use [\s\S]* instead of .* with s flag for ES5 compatibility
    const match = trimmed.match(/^\/([a-zA-Z0-9_/-]+)(?:\s+([\s\S]*))?$/);
    if (!match) return null;

    const commandName = match[1];
    const args = (match[2] || '').trim();

    // Check if this is a registered command
    if (!this.commands.has(commandName.toLowerCase())) {
      return null;
    }

    return { commandName, args };
  }

  /**
   * Expands a command with arguments.
   * Processes frontmatter, placeholders, file references, and bash execution.
   */
  async expandCommand(command: SlashCommand, args: string, options: SlashCommandExpansionOptions = {}): Promise<ExpansionResult> {
    const errors: string[] = [];

    // Parse frontmatter from command content
    const parsed = parseSlashCommandContent(command.content);

    // Start with the prompt content
    let result = parsed.promptContent;

    // Replace argument placeholders
    result = this.replaceArgumentPlaceholders(result, args);

    // Execute inline bash commands
    try {
      const bashResult = await this.executeInlineBash(result, options.bash);
      result = bashResult.content;
      errors.push(...bashResult.errors);
    } catch (error) {
      errors.push(`Bash execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Resolve @file references
    try {
      const fileResult = await this.resolveFileReferences(result);
      result = fileResult.content;
      errors.push(...fileResult.errors);
    } catch (error) {
      errors.push(`File reference error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      expandedPrompt: result.trim(),
      allowedTools: command.allowedTools || parsed.allowedTools,
      model: command.model || parsed.model,
      errors,
    };
  }

  /**
   * Replaces argument placeholders in content.
   * Handles $ARGUMENTS (all args) and $1, $2, etc. (positional).
   */
  private replaceArgumentPlaceholders(content: string, args: string): string {
    const argParts = this.parseArguments(args);
    const bashSentinel = '\uE000';

    // Collect bash inline blocks (!`...`) and replace with unique placeholders.
    // Args inside bash blocks are shell-escaped to prevent injection.
    const bashBlocks: string[] = [];
    const withoutBash = content.replace(/!`[^`]+`/g, (match) => {
      let block = match;
      block = block.replace(/\$ARGUMENTS/g, shellEscapeArgIfNeeded(args));
      for (let i = 0; i < argParts.length; i++) {
        const pattern = new RegExp(`\\$${i + 1}(?![0-9])`, 'g');
        block = block.replace(pattern, shellEscapeArgIfNeeded(argParts[i]));
      }
      block = block.replace(/\$\d+/g, '');
      const idx = bashBlocks.length;
      bashBlocks.push(block);
      return `${bashSentinel}BASH${idx}${bashSentinel}`;
    });

    // Replace $ARGUMENTS and $N in non-bash content (plain, no escaping)
    let result = withoutBash.replace(/\$ARGUMENTS/g, args);
    for (let i = 0; i < argParts.length; i++) {
      const pattern = new RegExp(`\\$${i + 1}(?![0-9])`, 'g');
      result = result.replace(pattern, argParts[i]);
    }
    result = result.replace(/\$\d+/g, '');

    // Restore bash blocks
    return result.replace(new RegExp(`${bashSentinel}BASH(\\d+)${bashSentinel}`, 'g'), (_, idx) => bashBlocks[Number(idx)]);
  }

  /**
   * Parses arguments respecting quoted strings.
   * "arg with spaces" and 'single quotes' are treated as single args.
   */
  private parseArguments(args: string): string[] {
    if (!args.trim()) return [];

    const parts: string[] = [];
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match: RegExpExecArray | null = regex.exec(args);
    while (match !== null) {
      // Use the captured group (without quotes) if available
      parts.push(match[1] ?? match[2] ?? match[0]);
      match = regex.exec(args);
    }

    return parts;
  }

  /**
   * Resolves @file references in content.
   * Replaces @path/to/file.md with file contents.
   */
  private async resolveFileReferences(content: string): Promise<{ content: string; errors: string[] }> {
    // Pattern: boundary + @"path" or @'path' or @path.ext (must have extension)
    // Boundary is included and preserved during replacement.
    const pattern = /(^|[^\w])@(?:"([^"]+)"|'([^']+)'|([^\s]+\.\w+))/g;

    const errors: string[] = [];
    const matches: Array<{ full: string; prefix: string; path: string; index: number }> = [];
    let match: RegExpExecArray | null = pattern.exec(content);
    while (match !== null) {
      const prefix = match[1] ?? '';
      const filePath = match[2] || match[3] || match[4];
      matches.push({ full: match[0], prefix, path: filePath, index: match.index });
      match = pattern.exec(content);
    }

    const resolved = await Promise.all(matches.map(async (m) => {
      try {
        const normalizedPath = m.path.replace(/\\/g, '/');
        const file = this.resolveVaultFile(normalizedPath);
        if (!isVaultFileCandidate(file)) {
          return {
            ...m,
            replacement: null,
            error: `File reference not found: ${normalizedPath}`,
          };
        }

        const fileContent = await this.app.vault.read(file);
        return {
          ...m,
          replacement: `${m.prefix}${fileContent}`,
          error: null,
        };
      } catch (error) {
        return {
          ...m,
          replacement: null,
          error: `File reference failed: ${m.path} (${error instanceof Error ? error.message : 'Unknown error'})`,
        };
      }
    }));

    let result = content;
    for (let i = resolved.length - 1; i >= 0; i--) {
      const item = resolved[i];
      if (item.error) {
        errors.push(item.error);
        continue;
      }

      if (item.replacement === null) {
        continue;
      }

      result =
        result.slice(0, item.index) +
        item.replacement +
        result.slice(item.index + item.full.length);
    }

    return { content: result, errors };
  }

  private resolveVaultFile(rawPath: string): TFile | null {
    const exact = this.app.vault.getAbstractFileByPath(rawPath);
    if (isVaultFileCandidate(exact)) {
      return exact;
    }

    const allFiles = this.app.vault.getMarkdownFiles();
    const normalizedNeedle = rawPath.toLowerCase();
    const basenameMatches = allFiles.filter((file) => file.name.toLowerCase() === normalizedNeedle);
    if (basenameMatches.length === 1) {
      return basenameMatches[0];
    }

    const suffixMatches = allFiles.filter((file) => file.path.toLowerCase().endsWith(`/${normalizedNeedle}`));
    if (suffixMatches.length === 1) {
      return suffixMatches[0];
    }

    return null;
  }

  /**
   * Executes inline bash commands.
   * Replaces !`command` with command output.
   */
  private async executeInlineBash(
    content: string,
    bashOptions?: BashExpansionOptions
  ): Promise<{ content: string; errors: string[] }> {
    // Pattern: !`command here`
    const pattern = /!`([^`]+)`/g;

    const errors: string[] = [];

    const matches: Array<{ full: string; command: string; index: number }> = [];
    let match: RegExpExecArray | null = pattern.exec(content);
    while (match !== null) {
      matches.push({ full: match[0], command: match[1], index: match.index });
      match = pattern.exec(content);
    }

    // Process matches in reverse order
    let result = content;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      try {
        if (!bashOptions?.enabled) {
          errors.push(`Inline bash is disabled: ${m.command}`);
          result = result.slice(0, m.index) + `[Inline bash disabled]` + result.slice(m.index + m.full.length);
          continue;
        }

        if (bashOptions.shouldBlockCommand?.(m.command)) {
          errors.push(`Inline bash blocked by blocklist: ${m.command}`);
          result = result.slice(0, m.index) + `[Blocked]` + result.slice(m.index + m.full.length);
          continue;
        }

        if (bashOptions.requestApproval) {
          const approved = await bashOptions.requestApproval(m.command);
          if (!approved) {
            errors.push(`Inline bash denied by user: ${m.command}`);
            result = result.slice(0, m.index) + `[Denied]` + result.slice(m.index + m.full.length);
            continue;
          }
        }

        const output = await this.bashRunner(m.command, this.vaultPath);
        result = result.slice(0, m.index) + output.trim() + result.slice(m.index + m.full.length);
      } catch (error) {
        const errorMsg = `[Error: ${error instanceof Error ? error.message : 'Command failed'}]`;
        errors.push(`Inline bash failed: ${m.command}`);
        result = result.slice(0, m.index) + errorMsg + result.slice(m.index + m.full.length);
      }
    }

    return { content: result, errors };
  }
}

/**
 * Shell-escapes an argument if it contains characters that could be
 * interpreted by the shell (semicolons, pipes, redirects, etc.).
 * Safe arguments (alphanumeric, dash, dot, slash) are returned as-is
 * to avoid breaking templates that already quote their placeholders.
 */
function shellEscapeArgIfNeeded(arg: string): string {
  if (/^[\w./:-]+$/.test(arg)) return arg;
  // Wrap in single quotes; escape any literal single quotes inside
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function defaultBashRunner(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        // Enhance PATH for GUI apps (Obsidian has minimal PATH)
        env: { ...process.env, PATH: getEnhancedPath() },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

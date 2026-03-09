/**
 * SlashCommandStorage - Handles slash command files in vault/.copilot/commands/
 * and global ~/.copilot/commands/
 *
 * Each command is stored as a Markdown file with YAML frontmatter.
 * Supports nested folders for organization.
 * Vault commands take precedence over global commands with the same name.
 *
 * File format:
 * ```markdown
 * ---
 * description: Review code for issues
 * argument-hint: "[file] [focus]"
 * allowed-tools:
 *   - Read
 *   - Grep
 * model: gpt-5.4
 * ---
 * Your prompt content here with $ARGUMENTS placeholder
 * ```
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseSlashCommandContent } from '../../utils/slashCommand';
import type { CopilotModel, SlashCommand } from '../types';
import type { VaultFileAdapter } from './VaultFileAdapter';

export const COMMANDS_PATH = '.copilot/commands';
export const GLOBAL_COMMANDS_PATH = path.join(os.homedir(), '.copilot', 'commands');
const INSTALLED_PLUGINS_PATH = path.join(os.homedir(), '.copilot', 'plugins', 'installed_plugins.json');

interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, Array<{ installPath: string }>>;
}

export class SlashCommandStorage {
  constructor(private adapter: VaultFileAdapter) {}

  async loadAll(): Promise<SlashCommand[]> {
    const pluginCommands = this.loadAllFromPlugins();
    const globalCommands = this.loadAllFromGlobal();
    const vaultCommands: SlashCommand[] = [];

    try {
      const files = await this.adapter.listFilesRecursive(COMMANDS_PATH);
      for (const filePath of files) {
        if (!filePath.endsWith('.md')) continue;
        try {
          const command = await this.loadFromFile(filePath);
          if (command) {
            vaultCommands.push(command);
          }
        } catch (error) {
          console.error(`[ObsidianCopilot] Failed to load command from ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('[ObsidianCopilot] Failed to list vault command files:', error);
    }

    const vaultNames = new Set(vaultCommands.map((command) => command.name));
    const globalNames = new Set(globalCommands.map((command) => command.name));

    return [
      ...pluginCommands.filter((command) => !globalNames.has(command.name) && !vaultNames.has(command.name)),
      ...globalCommands.filter((command) => !vaultNames.has(command.name)),
      ...vaultCommands,
    ];
  }

  private loadAllFromGlobal(): SlashCommand[] {
    const commands: SlashCommand[] = [];
    if (!fs.existsSync(GLOBAL_COMMANDS_PATH)) {
      return commands;
    }

    try {
      const files = this.listFilesRecursiveSync(GLOBAL_COMMANDS_PATH);
      for (const filePath of files) {
        if (!filePath.endsWith('.md')) continue;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const relativePath = path.relative(GLOBAL_COMMANDS_PATH, filePath);
          const command = this.parseFileFromGlobal(content, relativePath);
          if (command) {
            commands.push(command);
          }
        } catch (error) {
          console.error(`[ObsidianCopilot] Failed to load global command from ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('[ObsidianCopilot] Failed to list global command files:', error);
    }

    return commands;
  }

  private loadAllFromPlugins(): SlashCommand[] {
    const commands: SlashCommand[] = [];
    if (!fs.existsSync(INSTALLED_PLUGINS_PATH)) {
      return commands;
    }

    try {
      const content = fs.readFileSync(INSTALLED_PLUGINS_PATH, 'utf-8');
      const pluginsFile = JSON.parse(content) as InstalledPluginsFile;
      if (!pluginsFile.plugins || typeof pluginsFile.plugins !== 'object') {
        return commands;
      }

      for (const [pluginId, installations] of Object.entries(pluginsFile.plugins)) {
        if (!Array.isArray(installations) || installations.length === 0) continue;
        const installation = installations[0];
        if (!installation.installPath) continue;

        const commandsDir = path.join(installation.installPath, 'commands');
        if (!fs.existsSync(commandsDir)) continue;

        const files = this.listFilesRecursiveSync(commandsDir);
        for (const filePath of files) {
          if (!filePath.endsWith('.md')) continue;
          try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(commandsDir, filePath);
            const command = this.parseFileFromPlugin(fileContent, relativePath, pluginId);
            if (command) {
              commands.push(command);
            }
          } catch (error) {
            console.error(`[ObsidianCopilot] Failed to load plugin command from ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[ObsidianCopilot] Failed to load plugin commands:', error);
    }

    return commands;
  }

  private parseFileFromPlugin(content: string, relativePath: string, pluginId: string): SlashCommand {
    const parsed = parseSlashCommandContent(content);
    const name = relativePath.replace(/\.md$/, '');
    const pluginName = pluginId.split('@')[0];
    const id = `plugin-${pluginName}-${name.replace(/-/g, '-_').replace(/\//g, '--')}`;

    return {
      id,
      name,
      description: parsed.description ? `[${pluginName}] ${parsed.description}` : `[${pluginName}]`,
      argumentHint: parsed.argumentHint,
      allowedTools: parsed.allowedTools,
      model: parsed.model as CopilotModel | undefined,
      content: parsed.promptContent,
    };
  }

  private listFilesRecursiveSync(dir: string): string[] {
    const files: string[] = [];

    const processDir = (currentDir: string) => {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          processDir(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };

    processDir(dir);
    return files;
  }

  private parseFileFromGlobal(content: string, relativePath: string): SlashCommand {
    const parsed = parseSlashCommandContent(content);
    const name = relativePath.replace(/\.md$/, '');
    const id = `global-cmd-${name.replace(/-/g, '-_').replace(/\//g, '--')}`;

    return {
      id,
      name,
      description: parsed.description,
      argumentHint: parsed.argumentHint,
      allowedTools: parsed.allowedTools,
      model: parsed.model as CopilotModel | undefined,
      content: parsed.promptContent,
    };
  }

  async loadFromFile(filePath: string): Promise<SlashCommand | null> {
    try {
      const content = await this.adapter.read(filePath);
      return this.parseFile(content, filePath);
    } catch (error) {
      console.error(`[ObsidianCopilot] Failed to read command file ${filePath}:`, error);
      return null;
    }
  }

  async save(command: SlashCommand): Promise<void> {
    const filePath = this.getFilePath(command);
    const content = this.serializeCommand(command);
    await this.adapter.write(filePath, content);
  }

  async delete(commandId: string): Promise<void> {
    const files = await this.adapter.listFilesRecursive(COMMANDS_PATH);
    for (const filePath of files) {
      if (!filePath.endsWith('.md')) continue;
      const id = this.filePathToId(filePath);
      if (id === commandId) {
        await this.adapter.delete(filePath);
        return;
      }
    }
  }

  async hasCommands(): Promise<boolean> {
    const files = await this.adapter.listFilesRecursive(COMMANDS_PATH);
    return files.some((filePath) => filePath.endsWith('.md'));
  }

  getFilePath(command: SlashCommand): string {
    const safeName = command.name.replace(/[^a-zA-Z0-9_/-]/g, '-');
    return `${COMMANDS_PATH}/${safeName}.md`;
  }

  parseFile(content: string, filePath: string): SlashCommand {
    const parsed = parseSlashCommandContent(content);
    const id = this.filePathToId(filePath);
    const name = this.filePathToName(filePath);

    return {
      id,
      name,
      description: parsed.description,
      argumentHint: parsed.argumentHint,
      allowedTools: parsed.allowedTools,
      model: parsed.model as CopilotModel | undefined,
      content: parsed.promptContent,
    };
  }

  private filePathToId(filePath: string): string {
    const relativePath = filePath.replace(`${COMMANDS_PATH}/`, '').replace(/\.md$/, '');
    const escaped = relativePath.replace(/-/g, '-_').replace(/\//g, '--');
    return `cmd-${escaped}`;
  }

  private filePathToName(filePath: string): string {
    return filePath.replace(`${COMMANDS_PATH}/`, '').replace(/\.md$/, '');
  }

  private serializeCommand(command: SlashCommand): string {
    const lines: string[] = ['---'];
    if (command.description) {
      lines.push(`description: ${this.yamlString(command.description)}`);
    }
    if (command.argumentHint) {
      lines.push(`argument-hint: ${this.yamlString(command.argumentHint)}`);
    }
    if (command.allowedTools && command.allowedTools.length > 0) {
      lines.push('allowed-tools:');
      for (const tool of command.allowedTools) {
        lines.push(`  - ${tool}`);
      }
    }
    if (command.model) {
      lines.push(`model: ${command.model}`);
    }
    lines.push('---');
    const parsed = parseSlashCommandContent(command.content);
    lines.push(parsed.promptContent);
    return lines.join('\n');
  }

  private yamlString(value: string): string {
    if (value.includes(':') || value.includes('#') || value.includes('\n') || value.startsWith(' ') || value.endsWith(' ')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
}

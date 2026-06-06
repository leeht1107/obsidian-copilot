/**
 * StorageService - Main coordinator for distributed storage system.
 *
 * Manages:
 * - Settings in .copilot/settings.json (user-facing, shareable)
 * - Slash commands in .copilot/commands/*.md
 * - Chat sessions in .copilot/sessions/*.jsonl
 * - Plugin state in data.json (machine-specific)
 *
 * Handles migration from legacy data.json format on first load.
 */

import type { App, Plugin } from 'obsidian';

import type { Conversation, ObsidianCopilotSettings, SlashCommand } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { McpStorage } from './McpStorage';
import { SESSIONS_PATH, SessionStorage } from './SessionStorage';
import { SettingsStorage, type StoredSettings } from './SettingsStorage';
import { COMMANDS_PATH, SlashCommandStorage } from './SlashCommandStorage';
import { VaultFileAdapter } from './VaultFileAdapter';

/** Base path for all ObsidianCode storage. */
export const COPILOT_PATH = '.copilot';

/** Machine-specific state stored in Obsidian's data.json. */
export interface PluginState {
  activeConversationId: string | null;
}

const DEFAULT_STATE: PluginState = {
  activeConversationId: null,
};

/** Legacy data format (pre-migration). */
interface LegacyData extends Partial<ObsidianCopilotSettings> {
  conversations?: Conversation[];
  slashCommands?: SlashCommand[];
  activeConversationId?: string;
  lastEnvHash?: string;
  migrationVersion?: number;
}

export class StorageService {
  readonly settings: SettingsStorage;
  readonly commands: SlashCommandStorage;
  readonly sessions: SessionStorage;
  readonly mcp: McpStorage;

  private adapter: VaultFileAdapter;
  private plugin: Plugin;
  private app: App;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.adapter = new VaultFileAdapter(this.app);
    this.settings = new SettingsStorage(this.adapter);
    this.commands = new SlashCommandStorage(this.adapter);
    this.sessions = new SessionStorage(this.adapter);
    this.mcp = new McpStorage(this.adapter);
  }

  /** Initialize storage, running migration if needed. */
  async initialize(): Promise<{
    settings: StoredSettings;
    state: PluginState;
  }> {
    // Ensure .copilot directory structure exists
    await this.ensureDirectories();

    // Check if migration is needed based on legacy data.json contents
    const settingsExist = await this.settings.exists();
    const legacyData = await this.loadLegacyData();
    if (legacyData && this.needsMigration(legacyData)) {
      console.log('[ObsidianCopilot] Migrating from legacy data.json to distributed storage...');
      const migrated = await this.runMigration(legacyData, { migrateSettings: !settingsExist });
      if (migrated) {
        console.log('[ObsidianCopilot] Migration complete.');
      } else {
        console.warn('[ObsidianCopilot] Migration incomplete; will retry on next launch.');
      }
    }

    // Load settings from .copilot/settings.json
    const settings = await this.settings.load();

    // Load plugin state from data.json
    const state = await this.loadState();

    return { settings, state };
  }

  /** Check if migration is needed. */
  needsMigration(legacyData: LegacyData | null): boolean {
    if (!legacyData) return false;

    // Check if there's data to migrate
    const hasConversations = legacyData.conversations && legacyData.conversations.length > 0;
    const hasSlashCommands = legacyData.slashCommands && legacyData.slashCommands.length > 0;
    const stateKeys = new Set([
      'conversations',
      'slashCommands',
      'activeConversationId',
      'lastEnvHash',
      'migrationVersion',
    ]);
    const hasSettings = Object.keys(legacyData).some(key => !stateKeys.has(key));

    return hasConversations || hasSlashCommands || hasSettings;
  }

  /** Run migration from legacy data.json to distributed storage. */
  async runMigration(
    legacyData: LegacyData,
    options: { migrateSettings: boolean } = { migrateSettings: true }
  ): Promise<boolean> {
    let hadErrors = false;

    // 1. Migrate settings (exclude state fields and slashCommands)
    if (options.migrateSettings) {
      try {
        await this.migrateSettings(legacyData);
      } catch (error) {
        hadErrors = true;
        console.error('[ObsidianCopilot] Failed to migrate settings:', error);
      }
    }

    // 2. Migrate slash commands to individual files
    if (await this.migrateSlashCommands(legacyData.slashCommands || [])) {
      hadErrors = true;
    }

    // 3. Migrate conversations to individual JSONL files
    if (await this.migrateConversations(legacyData.conversations || [])) {
      hadErrors = true;
    }

    if (hadErrors) {
      return false;
    }

    // 4. Update data.json to state-only format
    await this.saveState({
      activeConversationId: legacyData.activeConversationId || null,
    });

    return true;
  }

  /** Load legacy data from Obsidian's data.json. */
  private async loadLegacyData(): Promise<LegacyData | null> {
    try {
      const data = await this.plugin.loadData();
      return data || null;
    } catch {
      return null;
    }
  }

  /** Load plugin state from data.json. */
  async loadState(): Promise<PluginState> {
    try {
      const data = await this.plugin.loadData();
      return {
        activeConversationId: data?.activeConversationId ?? DEFAULT_STATE.activeConversationId,
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  /** Save plugin state to data.json. */
  async saveState(state: PluginState): Promise<void> {
    await this.plugin.saveData(state);
  }

  /** Update specific state fields in data.json. */
  async updateState(updates: Partial<PluginState>): Promise<void> {
    const current = await this.loadState();
    await this.saveState({ ...current, ...updates });
  }

  /** Ensure all required directories exist. */
  async ensureDirectories(): Promise<void> {
    await this.adapter.ensureFolder(COPILOT_PATH);
    await this.adapter.ensureFolder(COMMANDS_PATH);
    await this.adapter.ensureFolder(SESSIONS_PATH);
  }

  /** Migrate settings from legacy format. */
  private async migrateSettings(legacyData: LegacyData): Promise<void> {
    // Extract settings fields (exclude state fields, slashCommands, conversations)
    const {
      slashCommands: _,
      conversations: __,
      activeConversationId: ___,
      lastEnvHash: ____,
      migrationVersion: _____,
      ...settingsFields
    } = legacyData;

    // Merge with defaults (permissions is now part of settings)
    const settings: StoredSettings = {
      ...this.getDefaultSettings(),
      ...settingsFields,
    };

    await this.settings.save(settings);
  }

  /** Migrate slash commands to individual files. */
  private async migrateSlashCommands(commands: SlashCommand[]): Promise<boolean> {
    let hadErrors = false;
    for (const command of commands) {
      try {
        const filePath = this.commands.getFilePath(command);
        if (await this.adapter.exists(filePath)) {
          continue;
        }
        await this.commands.save(command);
      } catch (error) {
        hadErrors = true;
        console.error(`[ObsidianCopilot] Failed to migrate command ${command.name}:`, error);
      }
    }
    return hadErrors;
  }

  /** Migrate conversations to individual JSONL files. */
  private async migrateConversations(conversations: Conversation[]): Promise<boolean> {
    let hadErrors = false;
    for (const conversation of conversations) {
      try {
        const filePath = this.sessions.getFilePath(conversation.id);
        if (await this.adapter.exists(filePath)) {
          continue;
        }
        await this.sessions.saveConversation(conversation);
      } catch (error) {
        hadErrors = true;
        console.error(`[ObsidianCopilot] Failed to migrate conversation ${conversation.id}:`, error);
      }
    }
    return hadErrors;
  }

  /** Get default settings (excluding state fields and slashCommands). */
  private getDefaultSettings(): StoredSettings {
    const {
      slashCommands: _,
      lastEnvHash: __,
      ...defaults
    } = DEFAULT_SETTINGS;
    return defaults;
  }

  /** Get the vault file adapter for direct file operations. */
  getAdapter(): VaultFileAdapter {
    return this.adapter;
  }
}

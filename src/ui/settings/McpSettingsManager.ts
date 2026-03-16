/**
 * ObsidianCode - MCP Settings Manager
 *
 * Component for managing MCP servers in the settings tab.
 * Displays server list with status indicators and action buttons.
 */

import { Notice, setIcon } from 'obsidian';

import { McpStorage } from '../../core/storage';
import type { CopilotMcpServer, McpServerConfig, McpServerType } from '../../core/types';
import { DEFAULT_MCP_SERVER, getMcpServerType } from '../../core/types';
import { testMcpServer } from '../../features/mcp/McpTester';
import type ObsidianCopilotPlugin from '../../main';
import { McpImportModal } from '../modals';
import { McpServerModal } from '../modals/McpServerModal';
import { McpTestModal } from '../modals/McpTestModal';
import { McpPresetGallery } from './McpPresetGallery';

/** Component for managing MCP servers in settings tab. */
export class McpSettingsManager {
  private containerEl: HTMLElement;
  private plugin: ObsidianCopilotPlugin;
  private servers: CopilotMcpServer[] = [];
  private documentClickHandler: (() => void) | null = null;

  constructor(containerEl: HTMLElement, plugin: ObsidianCopilotPlugin) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.loadAndRender();
  }

  private async loadAndRender() {
    this.servers = await this.plugin.storage.mcp.load();
    this.render();
  }

  private render() {
    this.containerEl.empty();
    const enabledCount = this.servers.filter((server) => server.enabled).length;

    // Preset gallery
    const galleryEl = this.containerEl.createDiv({ cls: 'ocop-mcp-gallery-section' });
    new McpPresetGallery(
      galleryEl,
      this.servers,
      async (server) => {
        await this.saveServer(server, null);
      },
      () => this.render()
    );

    // Header with Add dropdown
    const headerEl = this.containerEl.createDiv({ cls: 'ocop-mcp-header' });
    const titleWrap = headerEl.createDiv({ cls: 'ocop-mcp-title-wrap' });
    titleWrap.createSpan({ text: 'MCP Servers', cls: 'ocop-mcp-label' });
    titleWrap.createSpan({
      text: `${enabledCount}/${this.servers.length} enabled`,
      cls: 'ocop-mcp-summary',
    });

    // Add button with dropdown
    const actionsWrap = headerEl.createDiv({ cls: 'ocop-mcp-header-actions' });
    const bulkEnableBtn = actionsWrap.createEl('button', {
      cls: 'ocop-settings-action-btn',
      text: 'Enable all',
      attr: { 'aria-label': 'Enable all MCP servers' },
    });
    bulkEnableBtn.disabled = this.servers.length === 0 || enabledCount === this.servers.length;
    bulkEnableBtn.addEventListener('click', () => {
      void this.setAllServersEnabled(true);
    });

    const bulkDisableBtn = actionsWrap.createEl('button', {
      cls: 'ocop-settings-action-btn',
      text: 'Disable all',
      attr: { 'aria-label': 'Disable all MCP servers' },
    });
    bulkDisableBtn.disabled = enabledCount === 0;
    bulkDisableBtn.addEventListener('click', () => {
      void this.setAllServersEnabled(false);
    });

    const addContainer = actionsWrap.createDiv({ cls: 'ocop-mcp-add-container' });
    const addBtn = addContainer.createEl('button', {
      cls: 'ocop-settings-action-btn',
      attr: { 'aria-label': 'Add' },
    });
    setIcon(addBtn, 'plus');

    const dropdown = addContainer.createDiv({ cls: 'ocop-mcp-add-dropdown' });

    const stdioOption = dropdown.createDiv({ cls: 'ocop-mcp-add-option' });
    setIcon(stdioOption.createSpan({ cls: 'ocop-mcp-add-option-icon' }), 'terminal');
    stdioOption.createSpan({ text: 'stdio (local command)' });
    stdioOption.addEventListener('click', () => {
      dropdown.removeClass('is-visible');
      this.openModal(null, 'stdio');
    });

    const httpOption = dropdown.createDiv({ cls: 'ocop-mcp-add-option' });
    setIcon(httpOption.createSpan({ cls: 'ocop-mcp-add-option-icon' }), 'globe');
    httpOption.createSpan({ text: 'http / sse (remote)' });
    httpOption.addEventListener('click', () => {
      dropdown.removeClass('is-visible');
      this.openModal(null, 'http');
    });

    const importOption = dropdown.createDiv({ cls: 'ocop-mcp-add-option' });
    setIcon(importOption.createSpan({ cls: 'ocop-mcp-add-option-icon' }), 'clipboard-paste');
    importOption.createSpan({ text: 'Import from URL or JSON' });
    importOption.addEventListener('click', () => {
      dropdown.removeClass('is-visible');
      void this.importFromTextOrUrl();
    });

    // Toggle dropdown on button click
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.toggleClass('is-visible', !dropdown.hasClass('is-visible'));
    });

    // Close dropdown when clicking outside — replace previous handler to avoid stacking
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
    this.documentClickHandler = () => { dropdown.removeClass('is-visible'); };
    document.addEventListener('click', this.documentClickHandler);

    // Empty state
    if (this.servers.length === 0) {
      const emptyEl = this.containerEl.createDiv({ cls: 'ocop-mcp-empty' });
      emptyEl.setText('No MCP servers configured. Click "Add" to add one.');
      return;
    }

    // Server list
    const listEl = this.containerEl.createDiv({ cls: 'ocop-mcp-list' });
    for (const server of this.servers) {
      this.renderServerItem(listEl, server);
    }
  }

  private renderServerItem(listEl: HTMLElement, server: CopilotMcpServer) {
    const itemEl = listEl.createDiv({ cls: 'ocop-mcp-item' });
    if (!server.enabled) {
      itemEl.addClass('ocop-mcp-item-disabled');
    }

    // Status indicator (colored dot)
    const statusEl = itemEl.createDiv({ cls: 'ocop-mcp-status' });
    statusEl.addClass(
      server.enabled ? 'ocop-mcp-status-enabled' : 'ocop-mcp-status-disabled'
    );

    // Info section
    const infoEl = itemEl.createDiv({ cls: 'ocop-mcp-info' });

    // Name row with badges
    const nameRow = infoEl.createDiv({ cls: 'ocop-mcp-name-row' });

    const nameEl = nameRow.createSpan({ cls: 'ocop-mcp-name' });
    nameEl.setText(server.name);

    // Type badge
    const serverType = getMcpServerType(server.config);
    const typeEl = nameRow.createSpan({ cls: 'ocop-mcp-type-badge' });
    typeEl.setText(serverType);

    // Context-saving badge
    if (server.contextSaving) {
      const csEl = nameRow.createSpan({ cls: 'ocop-mcp-context-saving-badge' });
      csEl.setText('@');
      csEl.setAttribute('title', 'Context-saving: mention with @' + server.name + ' to enable');
    }

    // Description or command preview
    const previewEl = infoEl.createDiv({ cls: 'ocop-mcp-preview' });
    if (server.description) {
      previewEl.setText(server.description);
    } else {
      previewEl.setText(this.getServerPreview(server, serverType));
    }

    // Actions
    const actionsEl = itemEl.createDiv({ cls: 'ocop-mcp-actions' });

    // Verify button (shows tools)
    const testBtn = actionsEl.createEl('button', {
      cls: 'ocop-mcp-action-btn',
      attr: { 'aria-label': 'Verify (show tools)' },
    });
    setIcon(testBtn, 'zap');
    testBtn.addEventListener('click', () => this.testServer(server));

    // Enable/disable toggle button
    const toggleBtn = actionsEl.createEl('button', {
      cls: 'ocop-mcp-action-btn',
      attr: { 'aria-label': server.enabled ? 'Disable' : 'Enable' },
    });
    setIcon(toggleBtn, server.enabled ? 'toggle-right' : 'toggle-left');
    toggleBtn.addEventListener('click', () => this.toggleServer(server));

    // Edit button
    const editBtn = actionsEl.createEl('button', {
      cls: 'ocop-mcp-action-btn',
      attr: { 'aria-label': 'Edit' },
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', () => this.openModal(server));

    // Delete button
    const deleteBtn = actionsEl.createEl('button', {
      cls: 'ocop-mcp-action-btn ocop-mcp-delete-btn',
      attr: { 'aria-label': 'Delete' },
    });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.addEventListener('click', () => this.deleteServer(server));
  }

  private async testServer(server: CopilotMcpServer) {
    const modal = new McpTestModal(
      this.plugin.app,
      server.name,
      server.disabledTools,
      async (toolName, enabled) => {
        await this.updateDisabledTool(server, toolName, enabled);
      },
      async (disabledTools) => {
        await this.updateAllDisabledTools(server, disabledTools);
      }
    );
    modal.open();

    try {
      const result = await testMcpServer(server);
      modal.setResult(result);
    } catch (error) {
      modal.setError(error instanceof Error ? error.message : 'Verification failed');
    }
  }

  /**
   * Helper to update server.disabledTools with save and reload.
   * Rolls back on save failure; warns on reload failure (since save succeeded).
   */
  private async updateServerDisabledTools(
    server: CopilotMcpServer,
    newDisabledTools: string[] | undefined
  ): Promise<void> {
    const previous = server.disabledTools ? [...server.disabledTools] : undefined;
    server.disabledTools = newDisabledTools;

    try {
      await this.plugin.storage.mcp.save(this.servers);
    } catch (error) {
      server.disabledTools = previous;
      throw error;
    }

    try {
      await this.plugin.agentService.reloadMcpServers();
    } catch (error) {
      // Save succeeded but reload failed - don't rollback since disk has correct state
      console.warn('[ObsidianCopilot] MCP reload failed after save:', error);
      new Notice('Setting saved but reload failed. Changes will apply on next session.');
    }
  }

  private async updateDisabledTool(
    server: CopilotMcpServer,
    toolName: string,
    enabled: boolean
  ) {
    const disabledTools = new Set(server.disabledTools ?? []);
    if (enabled) {
      disabledTools.delete(toolName);
    } else {
      disabledTools.add(toolName);
    }
    await this.updateServerDisabledTools(
      server,
      disabledTools.size > 0 ? Array.from(disabledTools) : undefined
    );
  }

  private async updateAllDisabledTools(server: CopilotMcpServer, disabledTools: string[]) {
    await this.updateServerDisabledTools(
      server,
      disabledTools.length > 0 ? disabledTools : undefined
    );
  }

  private getServerPreview(server: CopilotMcpServer, type: McpServerType): string {
    if (type === 'stdio') {
      const config = server.config as { command: string; args?: string[] };
      const args = config.args?.join(' ') || '';
      return args ? `${config.command} ${args}` : config.command;
    } else {
      const config = server.config as { url: string };
      return config.url;
    }
  }

  private openModal(existing: CopilotMcpServer | null, initialType?: McpServerType) {
    const modal = new McpServerModal(
      this.plugin.app,
      this.plugin,
      existing,
      async (server) => {
        await this.saveServer(server, existing);
      },
      initialType
    );
    modal.open();
  }

  private async importFromTextOrUrl() {
    const modal = new McpImportModal(this.plugin.app);
    const result = await modal.openAndWait();
    if (!result) {
      return;
    }

    const parsed = McpStorage.tryParseClipboardConfig(result.text);
    if (!parsed || parsed.servers.length === 0) {
      new Notice('No valid MCP configuration found in the provided URL or JSON');
      return;
    }

    if (parsed.needsName || parsed.servers.length === 1) {
      const server = parsed.servers[0];
      const type = getMcpServerType(server.config);
      const serverModal = new McpServerModal(
        this.plugin.app,
        this.plugin,
        null,
        async (savedServer) => {
          await this.saveServer(savedServer, null);
        },
        type,
        server
      );
      serverModal.open();
      if (parsed.needsName) {
        new Notice('Enter a name for the imported server');
      }
      return;
    }

    await this.importServers(parsed.servers);
  }

  private async saveServer(server: CopilotMcpServer, existing: CopilotMcpServer | null) {
    if (existing) {
      // Update existing server
      const index = this.servers.findIndex((s) => s.name === existing.name);
      if (index !== -1) {
        // If name changed, check for conflicts
        if (server.name !== existing.name) {
          const conflict = this.servers.find((s) => s.name === server.name);
          if (conflict) {
            new Notice(`Server "${server.name}" already exists`);
            return;
          }
        }
        this.servers[index] = server;
      }
    } else {
      // Add new server - check for name conflict
      const conflict = this.servers.find((s) => s.name === server.name);
      if (conflict) {
        new Notice(`Server "${server.name}" already exists`);
        return;
      }
      this.servers.push(server);
    }

    await this.plugin.storage.mcp.save(this.servers);
    await this.plugin.agentService.reloadMcpServers();
    this.render();
    new Notice(existing ? `MCP server "${server.name}" updated` : `MCP server "${server.name}" added`);
  }

  private async importServers(servers: Array<{ name: string; config: McpServerConfig }>) {
    const added: string[] = [];
    const skipped: string[] = [];

    for (const server of servers) {
      const name = server.name.trim();
      if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
        skipped.push(server.name || '<unnamed>');
        continue;
      }

      const conflict = this.servers.find((s) => s.name === name);
      if (conflict) {
        skipped.push(name);
        continue;
      }

      this.servers.push({
        name,
        config: server.config,
        enabled: DEFAULT_MCP_SERVER.enabled,
        contextSaving: DEFAULT_MCP_SERVER.contextSaving,
      });
      added.push(name);
    }

    if (added.length === 0) {
      new Notice('No new MCP servers imported');
      return;
    }

    await this.plugin.storage.mcp.save(this.servers);
    await this.plugin.agentService.reloadMcpServers();
    this.render();

    let message = `Imported ${added.length} MCP server${added.length > 1 ? 's' : ''}`;
    if (skipped.length > 0) {
      message += ` (${skipped.length} skipped)`;
    }
    new Notice(message);
  }

  private async toggleServer(server: CopilotMcpServer) {
    server.enabled = !server.enabled;
    await this.plugin.storage.mcp.save(this.servers);
    await this.plugin.agentService.reloadMcpServers();
    this.render();
    new Notice(`MCP server "${server.name}" ${server.enabled ? 'enabled' : 'disabled'}`);
  }

  private async setAllServersEnabled(enabled: boolean) {
    let changed = false;
    for (const server of this.servers) {
      if (server.enabled !== enabled) {
        server.enabled = enabled;
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    await this.plugin.storage.mcp.save(this.servers);
    await this.plugin.agentService.reloadMcpServers();
    this.render();
    new Notice(enabled ? 'All MCP servers enabled' : 'All MCP servers disabled');
  }

  private async deleteServer(server: CopilotMcpServer) {
    if (!confirm(`Delete MCP server "${server.name}"?`)) {
      return;
    }

    this.servers = this.servers.filter((s) => s.name !== server.name);
    await this.plugin.storage.mcp.save(this.servers);
    await this.plugin.agentService.reloadMcpServers();
    this.render();
    new Notice(`MCP server "${server.name}" deleted`);
  }

  /** Refresh the server list (call after external changes). */
  public refresh() {
    this.loadAndRender();
  }

  /** Clean up global event listeners. */
  public destroy(): void {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
  }
}

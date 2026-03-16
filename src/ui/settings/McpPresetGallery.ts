/**
 * Obsidian Code - MCP Preset Gallery
 *
 * Gallery component for browsing and installing curated MCP server presets.
 */

import { Notice, setIcon } from 'obsidian';

import type { CopilotMcpServer } from '../../core/types';
import type { McpPreset } from '../../core/types/mcp-presets';
import { createServerFromPreset, MCP_PRESETS } from '../../core/types/mcp-presets';

/** Gallery component for browsing and installing curated MCP server presets. */
export class McpPresetGallery {
  private containerEl: HTMLElement;
  private servers: CopilotMcpServer[];
  private onInstall: (server: CopilotMcpServer) => Promise<void>;
  private onRefresh: () => void;

  constructor(
    containerEl: HTMLElement,
    servers: CopilotMcpServer[],
    onInstall: (server: CopilotMcpServer) => Promise<void>,
    onRefresh: () => void
  ) {
    this.containerEl = containerEl;
    this.servers = servers;
    this.onInstall = onInstall;
    this.onRefresh = onRefresh;
    this.render();
  }

  render() {
    this.containerEl.empty();
    this.renderRecommendedBundle();
    this.renderPresetCards();
  }

  private renderRecommendedBundle() {
    const recommendedPresets = MCP_PRESETS.filter((p) => p.inRecommendedBundle);
    const allInstalled = recommendedPresets.every((p) => this.isPresetInstalled(p));

    const callout = this.containerEl.createDiv({ cls: 'ocop-mcp-recommended' });
    if (allInstalled) {
      callout.addClass('is-installed');
    }

    // Title row
    const titleRow = callout.createDiv({ cls: 'ocop-mcp-recommended-title' });
    const iconEl = titleRow.createSpan({ cls: 'ocop-mcp-recommended-icon' });
    setIcon(iconEl, 'package');
    titleRow.createSpan({ text: '추천 도구 번들' });

    // Description
    const desc = callout.createDiv({ cls: 'ocop-mcp-recommended-desc' });
    desc.setText('단계별 사고, 문서검색 — 핵심 도구를 한 번에 설치합니다.');

    // Action
    if (allInstalled) {
      const badge = callout.createDiv({ cls: 'ocop-mcp-recommended-installed' });
      badge.setText('설치됨 ✅');
    } else {
      const btn = callout.createEl('button', {
        cls: 'ocop-mcp-recommended-btn',
        text: '설치하기',
      });
      btn.addEventListener('click', () => {
        void this.installRecommendedBundle();
      });
    }
  }

  private renderPresetCards() {
    const installedPresets = MCP_PRESETS.filter((p) => this.isPresetInstalled(p));
    if (installedPresets.length === 0) return;

    // Section label
    this.containerEl.createDiv({
      cls: 'ocop-mcp-gallery-label',
      text: '활성 도구',
    });

    const grid = this.containerEl.createDiv({ cls: 'ocop-mcp-gallery' });

    for (const preset of installedPresets) {
      const card = grid.createDiv({ cls: 'ocop-mcp-preset-card is-installed' });

      // Icon
      const iconEl = card.createDiv({ cls: 'ocop-mcp-preset-icon' });
      setIcon(iconEl, preset.icon);

      // Name
      card.createDiv({ cls: 'ocop-mcp-preset-name', text: preset.displayName });

      // Description
      card.createDiv({ cls: 'ocop-mcp-preset-desc', text: preset.description });

      // Status
      card.createDiv({ cls: 'ocop-mcp-preset-installed-badge', text: '설치됨' });
    }
  }

  private isPresetInstalled(preset: McpPreset): boolean {
    return this.servers.some((s) => s.name === preset.name);
  }

  private async installRecommendedBundle(): Promise<void> {
    const recommendedPresets = MCP_PRESETS.filter((p) => p.inRecommendedBundle);
    let installed = 0;

    for (const preset of recommendedPresets) {
      if (this.isPresetInstalled(preset)) continue;

      await this.onInstall(createServerFromPreset(preset));
      installed++;
    }

    if (installed > 0) {
      new Notice(`추천 도구 ${installed}개 설치됨`);
    }
    this.onRefresh();
  }
}

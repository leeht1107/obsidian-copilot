/**
 * Obsidian Code - MCP Preset definitions
 *
 * Curated list of MCP server presets for the gallery UI.
 */

import type { CopilotMcpServer, McpServerConfig } from './mcp';
import { DEFAULT_MCP_SERVER } from './mcp';

/** MCP preset definition for the gallery. */
export interface McpPreset {
  /** Server name (used as key, e.g., 'context7'). */
  name: string;
  /** Korean display name for UI. */
  displayName: string;
  /** Korean description for UI. */
  description: string;
  /** Obsidian icon name (lucide icons). */
  icon: string;
  /** Pre-built server config. */
  config: McpServerConfig;
  /** Whether this preset is in the recommended bundle. */
  inRecommendedBundle: boolean;
}

/** Curated MCP server presets. */
export const MCP_PRESETS: McpPreset[] = [
  {
    name: 'sequential-thinking',
    displayName: '단계별 사고',
    description: '복잡한 문제를 단계별로 분석합니다',
    icon: 'brain',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
    inRecommendedBundle: true,
  },
  {
    name: 'context7',
    displayName: '문서 검색',
    description: '라이브러리 공식 문서를 실시간으로 검색합니다',
    icon: 'book-open',
    config: { type: 'http', url: 'https://mcp.context7.com/mcp' },
    inRecommendedBundle: true,
  },
];

/** Create a CopilotMcpServer from a preset with default settings. */
export function createServerFromPreset(preset: McpPreset): CopilotMcpServer {
  return {
    name: preset.name,
    config: { ...preset.config },
    enabled: DEFAULT_MCP_SERVER.enabled,
    contextSaving: DEFAULT_MCP_SERVER.contextSaving,
  };
}

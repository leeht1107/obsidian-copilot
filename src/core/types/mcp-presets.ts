/**
 * Obsidian Code - MCP Preset definitions
 *
 * Curated list of MCP server presets for the gallery UI.
 */

import type { McpStdioServerConfig } from './mcp';

/** MCP preset definition for the gallery. */
export interface McpPreset {
  /** Server name (used as key, e.g., 'fetch'). */
  name: string;
  /** Korean display name for UI. */
  displayName: string;
  /** Korean description for UI. */
  description: string;
  /** Obsidian icon name (lucide icons). */
  icon: string;
  /** npm package name for npx. */
  npmPackage: string;
  /** Pre-built stdio config. */
  config: McpStdioServerConfig;
  /** Whether this preset is in the recommended bundle. */
  inRecommendedBundle: boolean;
  /** If the preset requires an API key. */
  requiresApiKey?: {
    envVar: string;
    label: string;
    helpUrl: string;
  };
  /** If the preset requires additional arguments. */
  requiresArgs?: {
    label: string;
    placeholder: string;
  };
}

/** Curated MCP server presets. */
export const MCP_PRESETS: McpPreset[] = [
  {
    name: 'fetch',
    displayName: '웹 페이지 가져오기',
    description: '웹 페이지를 가져와 마크다운으로 변환합니다',
    icon: 'globe',
    npmPackage: '@anthropic-ai/mcp-server-fetch',
    config: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-fetch'] },
    inRecommendedBundle: true,
  },
  {
    name: 'sequential-thinking',
    displayName: '단계별 사고',
    description: '복잡한 문제를 단계별로 분석합니다',
    icon: 'brain',
    npmPackage: '@anthropic-ai/mcp-server-sequential-thinking',
    config: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-sequential-thinking'] },
    inRecommendedBundle: true,
  },
  {
    name: 'memory',
    displayName: '기억 저장소',
    description: '대화 간 정보를 기억하고 불러옵니다',
    icon: 'database',
    npmPackage: '@anthropic-ai/mcp-server-memory',
    config: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-memory'] },
    inRecommendedBundle: true,
  },
  {
    name: 'context7',
    displayName: '문서 검색',
    description: '라이브러리 공식 문서를 실시간으로 검색합니다',
    icon: 'book-open',
    npmPackage: '@upstash/context7-mcp@latest',
    config: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] },
    inRecommendedBundle: true,
  },
  {
    name: 'brave-search',
    displayName: '웹 검색',
    description: 'Brave Search API로 웹을 검색합니다',
    icon: 'search',
    npmPackage: '@anthropic-ai/mcp-server-brave-search',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-server-brave-search'],
      env: { BRAVE_API_KEY: '' },
    },
    inRecommendedBundle: false,
    requiresApiKey: {
      envVar: 'BRAVE_API_KEY',
      label: 'Brave API 키',
      helpUrl: 'https://brave.com/search/api/',
    },
  },
  {
    name: 'filesystem',
    displayName: '파일 시스템',
    description: '로컬 파일 시스템에 접근합니다',
    icon: 'folder-open',
    npmPackage: '@anthropic-ai/mcp-server-filesystem',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-server-filesystem', '/path/to/directory'],
    },
    inRecommendedBundle: false,
    requiresArgs: {
      label: '접근할 디렉토리 경로',
      placeholder: '/Users/username/Documents',
    },
  },
];

/** Names of presets included in the recommended bundle. */
export const RECOMMENDED_PRESET_NAMES = new Set(
  MCP_PRESETS.filter((p) => p.inRecommendedBundle).map((p) => p.name)
);

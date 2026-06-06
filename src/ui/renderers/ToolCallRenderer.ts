/**
 * ObsidianCode - Tool call renderer
 *
 * Renders tool call UI elements with expand/collapse and status indicators.
 */

import { setIcon } from 'obsidian';

import { getToolIcon, MCP_ICON_MARKER } from '../../core/tools/toolIcons';
import type { ToolCallInfo } from '../../core/types';
import { MCP_ICON_SVG } from '../../features/chat/constants';
import { setupCollapsible } from '../utils/collapsible';

// Note: getToolIcon is now exported from src/tools/index.ts
// This module uses it internally but does not re-export it.

/** Set the tool icon on an element. */
export function setToolIcon(el: HTMLElement, name: string) {
  const icon = getToolIcon(name);
  if (icon === MCP_ICON_MARKER) {
    el.innerHTML = MCP_ICON_SVG;
  } else {
    setIcon(el, icon);
  }
}

/** Parse MCP tool name into server and tool parts. */
export function parseMcpToolName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith('mcp__')) return null;
  const parts = name.split('__');
  const server = parts[1] || 'MCP';
  const tool = parts.slice(2).join('__') || 'tool';
  return { server, tool };
}

/** Generate a human-readable label for a tool call. */
export function getToolLabel(name: string, input: Record<string, unknown>): string {
  // MCP tools: show clean tool name (server badge rendered separately)
  const mcp = parseMcpToolName(name);
  if (mcp) {
    return mcp.tool.replace(/[-_]/g, ' ');
  }

  switch (name) {
    case 'Read':
      return `Read: ${shortenPath(input.file_path as string) || 'file'}`;
    case 'Write':
      return `Write: ${shortenPath(input.file_path as string) || 'file'}`;
    case 'Edit':
      return `Edit: ${shortenPath(input.file_path as string) || 'file'}`;
    case 'Bash': {
      const cmd = (input.command as string) || 'command';
      return `Bash: ${cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd}`;
    }
    case 'Glob':
      return `Glob: ${input.pattern || 'files'}`;
    case 'Grep':
      return `Grep: ${input.pattern || 'pattern'}`;
    case 'WebSearch': {
      const query = (input.query as string) || 'search';
      return `WebSearch: ${query.length > 40 ? query.substring(0, 40) + '...' : query}`;
    }
    case 'WebFetch': {
      const url = (input.url as string) || 'url';
      return `WebFetch: ${url.length > 40 ? url.substring(0, 40) + '...' : url}`;
    }
    case 'LS':
      return `LS: ${shortenPath(input.path as string) || '.'}`;
    case 'TodoWrite': {
      const todos = input.todos as Array<{ status: string }> | undefined;
      if (todos && Array.isArray(todos)) {
        const completed = todos.filter(t => t.status === 'completed').length;
        return `Tasks (${completed}/${todos.length})`;
      }
      return 'Tasks';
    }
    case 'Skill': {
      const args = (input.args as string) || '';
      return args.length > 40 ? args.substring(0, 40) + '...' : args || 'running';
    }
    default:
      return name;
  }
}

/** Shorten a file path for display. */
function shortenPath(filePath: string | undefined): string {
  if (!filePath) return '';
  // Normalize path separators for cross-platform support
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 3) return normalized;
  return '.../' + parts.slice(-2).join('/');
}

interface WebSearchLink {
  title: string;
  url: string;
}

interface ResultPreview {
  lines: string[];
  hasMore: boolean;
  moreLines?: number;
  truncatedByLength: boolean;
}

const DEFAULT_RESULT_PREVIEW_MAX_LENGTH = 2000;

function getResultPreview(result: string, maxLines: number, maxLength: number): ResultPreview {
  const truncatedByLength = result.length > maxLength;
  const cappedResult = truncatedByLength ? result.substring(0, maxLength) : result;
  const lines = cappedResult.split(/\r?\n/);
  return {
    lines: lines.slice(0, maxLines),
    hasMore: truncatedByLength || lines.length > maxLines,
    moreLines: !truncatedByLength && lines.length > maxLines ? lines.length - maxLines : undefined,
    truncatedByLength,
  };
}

function countNonEmptyLines(text: string): number {
  let count = 0;
  let lineStart = 0;

  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      let lineEnd = i;
      if (lineEnd > lineStart && text[lineEnd - 1] === '\r') {
        lineEnd--;
      }
      if (text.slice(lineStart, lineEnd).trim() !== '') {
        count++;
      }
      lineStart = i + 1;
    }
  }

  return count;
}

function parseWebSearchResult(result: string): WebSearchLink[] | null {
  const linksMatch = result.match(/Links:\s*(\[[\s\S]*\])/);
  if (!linksMatch) return null;

  try {
    const links = JSON.parse(linksMatch[1]) as WebSearchLink[];
    if (!Array.isArray(links) || links.length === 0) return null;
    return links;
  } catch {
    return null;
  }
}

/** Render WebSearch result as DOM elements. */
export function renderWebSearchResult(container: HTMLElement, result: string, maxItems = 3): boolean {
  const links = parseWebSearchResult(result);
  if (!links) return false;

  container.empty();

  const displayItems = links.slice(0, maxItems);
  displayItems.forEach(link => {
    const item = container.createSpan({ cls: 'ocop-tool-result-bullet' });
    item.setText(`• ${link.title}`);
  });

  if (links.length > maxItems) {
    const more = container.createSpan({ cls: 'ocop-tool-result-item' });
    more.setText(`${links.length - maxItems} more results`);
  }

  return true;
}

/** Render Read tool result showing line count. */
export function renderReadResult(container: HTMLElement, result: string): void {
  container.empty();
  const item = container.createSpan({ cls: 'ocop-tool-result-item' });
  item.setText(`${countNonEmptyLines(result)} lines read`);
}

/** Render generic result as DOM elements. Strips line number prefixes. */
export function renderResultLines(
  container: HTMLElement,
  result: string,
  maxLines = 3,
  maxLength = DEFAULT_RESULT_PREVIEW_MAX_LENGTH
): void {
  container.empty();

  const preview = getResultPreview(result, maxLines, maxLength);

  preview.lines.forEach(line => {
    // Strip line number prefix (e.g., "  1→" or "123→")
    const stripped = line.replace(/^\s*\d+→/, '');
    const item = container.createSpan({ cls: 'ocop-tool-result-item' });
    item.setText(stripped);
  });

  if (preview.hasMore) {
    const more = container.createSpan({ cls: 'ocop-tool-result-item' });
    more.setText(
      preview.truncatedByLength ? 'Result preview truncated' : `${preview.moreLines ?? 0} more lines`
    );
  }
}

/** Truncate a result string for display. */
export function truncateResult(result: string, maxLines = 20, maxLength = 2000): string {
  const preview = getResultPreview(result, maxLines, maxLength);
  if (preview.hasMore) {
    const suffix = preview.truncatedByLength ? 'Result preview truncated' : `${preview.moreLines ?? 0} more lines`;
    return preview.lines.join('\n') + `\n${suffix}`;
  }
  return result;
}

/** Check if a tool result indicates a blocked action. */
export function isBlockedToolResult(content: string, isError?: boolean): boolean {
  const lower = content.toLowerCase();
  if (lower.includes('blocked by blocklist')) return true;
  if (lower.includes('outside the vault')) return true;
  if (lower.includes('access denied')) return true;
  if (lower.includes('user denied')) return true;
  if (lower.includes('approval')) return true;
  if (isError && lower.includes('deny')) return true;
  return false;
}

/** Dispatch tool result rendering by tool name. */
function renderToolResultContent(el: HTMLElement, name: string, result: string): void {
  if (name === 'WebSearch') {
    if (!renderWebSearchResult(el, result, 3)) {
      renderResultLines(el, result, 3);
    }
  } else if (name === 'Read') {
    renderReadResult(el, result);
  } else {
    renderResultLines(el, result, 3);
  }
}

/** Create the common DOM skeleton for a tool call. */
function createToolCallDOM(
  parentEl: HTMLElement,
  toolCall: ToolCallInfo
): { toolEl: HTMLElement; header: HTMLElement; statusEl: HTMLElement; content: HTMLElement; resultText: HTMLElement } {
  const isMcp = toolCall.name.startsWith('mcp__');
  const isSkill = toolCall.name === 'Skill';
  const badgeType = isMcp ? ' is-mcp' : isSkill ? ' is-skill' : '';
  const toolEl = parentEl.createDiv({ cls: `ocop-tool-call${badgeType}` });

  // Header (clickable to expand/collapse)
  const header = toolEl.createDiv({ cls: 'ocop-tool-header' });
  header.setAttribute('tabindex', '0');
  header.setAttribute('role', 'button');

  // Tool icon (decorative)
  const iconEl = header.createSpan({ cls: 'ocop-tool-icon' });
  iconEl.setAttribute('aria-hidden', 'true');
  setToolIcon(iconEl, toolCall.name);

  // MCP server badge
  if (isMcp) {
    const mcpInfo = parseMcpToolName(toolCall.name);
    if (mcpInfo) {
      header.createSpan({ cls: 'ocop-tool-mcp-badge', text: mcpInfo.server });
    }
  }

  // Skill badge
  if (isSkill) {
    const skillName = (toolCall.input.skill as string) || 'skill';
    header.createSpan({ cls: 'ocop-tool-skill-badge', text: skillName });
  }

  // Tool label
  const labelEl = header.createSpan({ cls: 'ocop-tool-label' });
  labelEl.setText(getToolLabel(toolCall.name, toolCall.input));

  // Status indicator
  const statusEl = header.createSpan({ cls: 'ocop-tool-status' });
  statusEl.addClass(`status-${toolCall.status}`);
  statusEl.setAttribute('aria-label', `Status: ${toolCall.status}`);

  // Collapsible content
  const content = toolEl.createDiv({ cls: 'ocop-tool-content' });

  // Tree-branch result row
  const resultRow = content.createDiv({ cls: 'ocop-tool-result-row' });
  const branch = resultRow.createSpan({ cls: 'ocop-tool-branch' });
  branch.setText('└─');
  const resultText = resultRow.createSpan({ cls: 'ocop-tool-result-text' });

  return { toolEl, header, statusEl, content, resultText };
}

/** Set a completed/error/blocked status icon. */
function setStatusIcon(statusEl: HTMLElement, status: string): void {
  if (status === 'completed') {
    setIcon(statusEl, 'check');
  } else if (status === 'error') {
    setIcon(statusEl, 'x');
  } else if (status === 'blocked') {
    setIcon(statusEl, 'shield-off');
  }
}

/** Renders a tool call UI element (for streaming). Collapsed by default. */
export function renderToolCall(
  parentEl: HTMLElement,
  toolCall: ToolCallInfo,
  toolCallElements: Map<string, HTMLElement>
): HTMLElement {
  const { toolEl, header, statusEl, content, resultText } = createToolCallDOM(parentEl, toolCall);
  toolEl.dataset.toolId = toolCall.id;
  toolCallElements.set(toolCall.id, toolEl);

  // Streaming: show spinner
  if (toolCall.status === 'running') {
    statusEl.createSpan({ cls: 'ocop-spinner' });
  }
  resultText.setText('Running...');

  // Setup collapsible behavior and sync state to toolCall
  const state = { isExpanded: false };
  toolCall.isExpanded = false;
  setupCollapsible(toolEl, header, content, state, {
    initiallyExpanded: false,
    onToggle: (expanded) => { toolCall.isExpanded = expanded; },
    baseAriaLabel: getToolLabel(toolCall.name, toolCall.input)
  });

  return toolEl;
}

/** Update a tool call element with result. */
export function updateToolCallResult(
  toolId: string,
  toolCall: ToolCallInfo,
  toolCallElements: Map<string, HTMLElement>
) {
  const toolEl = toolCallElements.get(toolId);
  if (!toolEl) return;

  // Update status indicator
  const statusEl = toolEl.querySelector('.ocop-tool-status');
  if (statusEl) {
    statusEl.className = 'ocop-tool-status';
    statusEl.addClass(`status-${toolCall.status}`);
    statusEl.empty();
    setStatusIcon(statusEl as HTMLElement, toolCall.status);
  }

  // Update result text
  const resultText = toolEl.querySelector('.ocop-tool-result-text') as HTMLElement;
  if (resultText && toolCall.result) {
    renderToolResultContent(resultText, toolCall.name, toolCall.result);
  }
}

/** Render a stored tool call (non-streaming). Collapsed by default. */
export function renderStoredToolCall(
  parentEl: HTMLElement,
  toolCall: ToolCallInfo
): HTMLElement {
  const { toolEl, header, statusEl, content, resultText } = createToolCallDOM(parentEl, toolCall);

  // Already completed — show status icon
  setStatusIcon(statusEl, toolCall.status);

  // Render result
  if (toolCall.result) {
    renderToolResultContent(resultText, toolCall.name, toolCall.result);
  } else {
    resultText.setText('No result');
  }

  // Setup collapsible behavior
  const state = { isExpanded: false };
  setupCollapsible(toolEl, header, content, state, {
    initiallyExpanded: false,
    baseAriaLabel: getToolLabel(toolCall.name, toolCall.input)
  });

  return toolEl;
}

# Agent Guidelines

## Current Status
This project is **Obsidian Copilot**.
It is **NOT** `cc-obsidian` or Claude Code anymore.

## When working on this repo:
1. **Context**: Always assume the backend is **GitHub Copilot CLI**, not Claude SDK.
2. **Terminology**: Use "Copilot", "Bridge Service", "CLI". Avoid "Agent", "Tool Use", "Plan Mode".
3. **Features**:
    - Supported: Chat, Text Streaming, File Context (@-mentions), Inline Editing.
    - **NOT** Supported: File creation, Bash execution, MCP, Complex agent loops.

## Verification
- Before submitting code, ensure it does not import from `@anthropic-ai/claude-agent-sdk`.
- Run `npm run build` to verify no lingering dependencies.

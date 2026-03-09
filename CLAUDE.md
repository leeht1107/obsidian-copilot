# Project Context: Obsidian Copilot

This repository hosts **Obsidian Copilot**, an Obsidian plugin that integrates **GitHub Copilot CLI** into the Obsidian interface.

## Core Identity
- **Name**: Obsidian Copilot (formerly `cc-obsidian`)
- **Backend**: `@github/copilot` (CLI)
- **Primary Function**: Sidebar chat interface for AI assistance within Obsidian.
- **Key Mechanism**: Spawns `copilot` process, streams stdout/stderr, manages history via prompt injection.

## Architecture
- **Service**: `CopilotBridgeService` (Singleton) - wrappers `spawn` for CLI interaction.
- **View**: `ObsidianCodeView` (React) - Chat UI.
- **Settings**: `ObsidianCodeSettings` - configuration management.

## History & Migration
Originally based on Claude Code (`cc-obsidian`), this project was migrated to GitHub Copilot to provide a more widely accessible backend.
- **Removed**: Claude Agent SDK, MCP support, Plan mode, Tool execution (bash/file).
- **Retained**: Chat UI, Context management (files/images), Inline edit hooks.

## Developer Notes
- **Build**: `npm run build` (uses esbuild)
- **Test**: `npm test` (vitest)
- **Release**: Push to main -> BRAT update.

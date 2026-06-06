# Obsidian Copilot Integration Handoff

## Purpose

This document captures the high-value context needed for future AI agents to continue work on `obsidian-copilot` without losing architectural and product reasoning.

## Current Product Direction

- Primary goal: make `obsidian-copilot` feel fast, robust, and beginner-friendly.
- Secondary goal: absorb strong behaviors from `obsidian-code` where the provider surface allows it.
- Important constraint: GitHub Copilot CLI is **not** equivalent to Claude Code in exposed control surface, even though both are CLI-based.

## Core Architectural Reality

### Current CLI setup baseline

- The plugin targets the standalone `copilot` CLI from `@github/copilot`; it does not target `gh copilot`.
- GitHub currently documents npm, WinGet, Homebrew, install-script, and direct-download install paths.
- The plugin's automatic setup path still uses `npm install -g @github/copilot` because it is cross-platform and already wired in `AutoSetupService`.
- GitHub Docs document both `copilot login` and first-run interactive `/login` flows. Keep user-facing setup text compatible with both.

### Current transport

- `obsidian-copilot` currently uses a **prompt-mode wrapper** around Copilot CLI.
- Main integration point: `src/core/agent/CopilotBridgeService.ts`
- Current style:
  - build prompt
  - invoke `copilot -p ...`
  - parse JSONL output
  - normalize to `StreamChunk`

### What prompt mode can do well

- streamed text
- streamed reasoning deltas (`assistant.reasoning_delta`) when provider emits them
- tool requests / tool completion events
- usage metadata
- session resume support
- MCP config injection and tool guardrails

### What prompt mode does *not* reliably give us

- true structured `AskUserQuestion` tool flow in a dependable way
- explicit, confirmed reasoning-effort toggle surface for the current plugin integration
- richer session config controls equivalent to a true session-based agent protocol

## ACP Findings

### What was confirmed

- `copilot --acp` exists and starts a stdio JSON-RPC server.
- `initialize` succeeds with `protocolVersion: 1`.
- `session/new` appears to require at least:
  - `cwd`
  - `mcpServers`

### What Oracle concluded

- ACP is **feasible**, but likely **not worth a full migration right now**.
- Main reason: the repo already gets most value from prompt mode, while ACP would introduce a second transport/session model and large state complexity.
- Recommended approach from Oracle:
  - keep prompt mode as default
  - only do a small ACP spike if reasoning/session config becomes business-critical

### Practical interpretation

- "Can we ever support real reasoning control?" -> **Probably yes**, via ACP session config if the CLI exposes the right option.
- "Should we migrate now just for thinking toggle?" -> **Probably no**.

## Thinking / Reasoning UX Decisions

### Important correction

- A real user-controlled thinking toggle is **not currently implemented**.
- Earlier UI gave the wrong impression; this was corrected.

### Current behavior

- Thinking is now **model-managed by default**, not user-toggled.
- Example intent:
  - `gpt-4o` -> default `off`
  - `gpt-5-mini` -> default `on`
- The UI should reflect the selected model's default state, not stale saved state.

### Related usage UI

- GitHub is moving Copilot billing language toward **AI Credits** and usage-based billing.
- The CLI payloads observed by this repo have exposed `usage.premiumRequests`, so some internal names and UI strings may still use premium-request language.
- Any usage surfaced in the plugin is local and observed from Copilot CLI responses only. It is **not** an authoritative credits, quota, billing, or remaining-balance model.
- Do not imply that the plugin can query account-level AI Credits or organization billing state unless a dedicated provider/API path is implemented.

## AskUserQuestion Findings

### What exists already

- `AskUserQuestionPanel` UI exists.
- supporting types exist (`AskUserQuestionQuestion`, etc.)
- `StreamController` contains handling for the tool path.

### Why it does not work reliably today

- Copilot CLI prompt mode does not reliably expose `AskUserQuestion` as a usable tool event in real flows.
- This means the UI is present, but the provider often does not trigger it.

### Current fallback

- If `AskUserQuestion` is unavailable, the system prompt instructs the model to:
  - ask one concise plain-text question in chat
  - stop after the question

### Product implication

- Do **not** market or present `AskUserQuestion` as fully supported unless provider support is proven.
- If revisited, either:
  1. hide user-facing structured question expectations, or
  2. pursue ACP/session-based support in a dedicated spike.

## MCP / Skills Findings

### MCP

- MCP is supported and actively integrated.
- Key pieces:
  - `McpService`
  - `McpServerManager`
  - `.copilot/mcp.json`
- Recent UX improvements:
  - URL/JSON import flow
  - enabled summary
  - bulk enable/disable

### Skills

- Important correction: skills are **not hypothetical** in this repo.
- There is already a skills-oriented implementation:
  - `src/features/skills/ObsidianSkillsInstaller.ts`
  - settings UI in `src/features/settings/ObsidianCopilotSettings.ts`
- The repo assumes `.copilot/skills` as a valid integration path.

### Product implication

- The question is no longer "can skills exist?"
- The question is now:
  - how beginner-friendly is the skill installation/management UX?
  - how robust is the lifecycle?

## Performance / Bottleneck Findings

Several critical bottlenecks were already addressed.

### Completed critical improvements

1. Copilot capability probe prewarm
   - removed sync CLI capability cost from first-send hot path

2. Streaming markdown render cost reduction
   - changed per-chunk markdown rerender into cheap streaming preview + final markdown render

3. External context scan async path
   - removed blocking recursive sync scan from mention hot path

4. Earlier assistant placeholder / `Working...`
   - reduced perceived latency by surfacing assistant state earlier

### Remaining likely performance concerns

- any future ACP spike could reintroduce complexity into hot paths
- external context scanning still needs careful cache invalidation discipline
- very large tool/result payload rendering may still be worth profiling later

## UX Decisions Already Made

- shell moved toward a more technical Copilot-first tone
- welcome state improved
- context chips made more explicit
- selection context became more controllable
- `model-managed` wording was removed because it confused users

## Release / Versioning Lessons

- Obsidian/BRAT release success requires all three release assets:
  - `manifest.json`
  - `main.js`
  - `styles.css`
- One previous failure came from creating a GitHub release without uploading those assets.
- BRAT install URLs drift easily when repos are forked or transferred. Setup docs should point to the repository that actually hosts the release assets; this checkout currently uses `https://github.com/leeht1107/obsidian-copilot`.
- When updating release versions, keep:
  - `manifest.json`
  - `package.json`
  - `package-lock.json`
  in sync.

## Recommended Next Steps

### If optimizing for product value

1. improve beginner-friendly **skills** UX
2. further simplify MCP onboarding and diagnostics
3. clean up any user-facing traces of unsupported structured question UX

### If optimizing for technical exploration

1. do a **small ACP spike** behind a dev flag
2. confirm whether real session config exposes reasoning effort
3. stop immediately if ACP requires broad tool-loop/state-machine rewrites

## Anti-Goals / Things Not To Re-Do Blindly

- Do not reintroduce a fake user-controlled thinking toggle unless provider control is actually wired.
- Do not assume `AskUserQuestionPanel` being present means the provider supports it.
- Do not equate "CLI-based" with "same capabilities as obsidian-code's provider path".
- Do not create GitHub releases without the Obsidian plugin assets attached.

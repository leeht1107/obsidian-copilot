# Obsidian Copilot Prerequisites

Use this checklist before installing or enabling `obsidian-copilot`.

## Required

### 1. Obsidian desktop
- The plugin is desktop-only.
- Install the desktop app and open the vault where you want to use Copilot.

### 2. GitHub Copilot access
- You need a GitHub account with GitHub Copilot access.
- Model availability depends on your Copilot plan and any organization policy.

### 3. Node.js
- Install Node.js 22 or newer.
- Verify with:

```bash
node --version
npm --version
```

### 4. GitHub Copilot CLI
- Install the `copilot` CLI:

```bash
npm install -g @github/copilot
```

- Verify with:

```bash
copilot --help
copilot version
```

### 5. Copilot CLI authentication
- Sign in before using the plugin:

```bash
copilot login
```

- If you prefer token-based auth, you can provide one of these environment variables:
  - `COPILOT_GITHUB_TOKEN`
  - `GH_TOKEN`
  - `GITHUB_TOKEN`

## Optional

### GitHub CLI wrapper
- `gh copilot` is optional.
- It can download or launch the real `copilot` binary, but this plugin uses `copilot` directly.
- If you want the wrapper too:

```bash
gh copilot -- --help
```

### Custom CLI path
- If `copilot` is not available on your `PATH`, set the full executable path in the plugin settings.
- Example:

```text
/usr/local/bin/copilot
```

## Quick preflight

Run these before enabling the plugin:

```bash
node --version
copilot --help
copilot login
```

If all three work, `obsidian-copilot` should be ready to use inside Obsidian.

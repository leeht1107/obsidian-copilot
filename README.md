# Obsidian Copilot

[![GitHub](https://img.shields.io/badge/GitHub-Obsidian--Copilot-blue?style=for-the-badge&logo=github)](https://github.com/leeht1107/obsidian-copilot)

Your AI coding assistant inside Obsidian, powered by **GitHub Copilot CLI**.

Have meaningful conversations with your codebase. Copilot understands your notes, reads your files, and helps you write better content—all directly within Obsidian sidebar.

---

## 🌟 Key Features

*   **💬 Chat with Context**: Chat with GitHub Copilot right in your sidebar.
*   **🧠 Context-Aware**: Copilot knows about your current note and conversation history.
*   **⚡ Fast & Lightweight**: Uses the official `copilot` CLI for speed and reliability.
*   **📎 Smart Attachments**: Reference other notes using `@` to give Copilot more context.
*   **✏️ Inline Edits**: Select text and ask Copilot to rewrite, summarize, or fix it in place.

---

## 🚀 Prerequisites

This plugin requires the standalone **GitHub Copilot CLI** (`copilot`), not `gh copilot`.

1.  **Install Node.js** (v22 or higher)
2.  **Install or update Copilot CLI**:
    ```bash
    npm install -g @github/copilot
    ```
    GitHub also documents WinGet on Windows and Homebrew on macOS/Linux. The plugin's built-in setup flow uses the npm package because it works across platforms.
3.  **Authenticate**:
    Run this command in your terminal and follow the instructions:
    ```bash
    copilot login
    ```
    If you start the interactive CLI with `copilot` first, use `/login` when prompted.
4.  **Verify**:
    ```bash
    copilot version
    copilot --help
    ```

If npm reports a permissions error on macOS/Linux, prefer fixing your npm global install location or using Homebrew first. Use `sudo npm install -g @github/copilot` only as a last resort.

---

## 📦 Installation

### Via BRAT (Recommended for Beta)

1.  Install **BRAT** from the Obsidian Community Plugins.
2.  Open command palette (`Cmd/Ctrl + P`) -> `BRAT: Add a beta plugin for testing`.
3.  Enter the repository URL: `https://github.com/leeht1107/obsidian-copilot`.
    If your teacher or maintainer provides a class fork, use that fork URL instead.
4.  Enable "Obsidian Copilot" in Community Plugins settings.

### Manual Installation

1.  Clone this repository into your `.obsidian/plugins` folder.
2.  Run `npm install && npm run build`.
3.  Enable the plugin in Obsidian settings.

---

## 🎮 Usage

1.  **Open Chat**: Click the robot icon in the left ribbon or run "Open chat view" command.
2.  **Ask Questions**: Type your question. Copilot will answer based on the context.
3.  **Attach Files**: Type `@` to link specific notes or folders to the conversation.
4.  **Inline Edit**: Select text in any note -> Run "Inline edit" command -> Describe changes.

---

## ⚙️ Configuration

*   **Copilot CLI Path**: If Copilot is not found automatically, enter the full path to the executable (e.g., `/usr/local/bin/copilot`).
*   **GitHub Token** (Optional): Provide a `GH_TOKEN` if you prefer not to use the global auth session.
*   **AI Credits / Usage**: GitHub manages AI Credits and billing. Any usage shown by this plugin is based only on values observed locally from Copilot CLI responses, so it is not an authoritative credits, quota, billing, or remaining-balance view.

---

## 📜 License

[MIT License](LICENSE)
